/**
 * Structures object and model data and provides abstractions for loading and
 * manipulating the data.
 *
 * @author Chris Moyer
 */

/**
 * Base model object
 * This shouldn't ever be called directly
 *
 * @constructor
 */
botoweb.ModelMeta = function(xml){
	var self = this;
	xml = $(xml);

	self._DEBUG_MODEL_INSTANCE = 1;
	self.name = xml.attr('name');
	self.href = $('href', xml).text();
	self.methods = {};
	self._cache = {};
	self.cache_timeouts = {};
	self.prop_map = {};
	self.data_tables = {};

	// Parse method names and descriptions
	$('methods *', xml).each(function(){ self.methods[this.nodeName] = $(this).text() });

	self.properties = $('properties property', xml).map(function(){
		var xml = $(this);
		var property = {
			_DEBUG_MODEL_PROPERTIES: 1,
		};

		// Pull attributes from the property node
		var map = {
			name: 'name',
			_type: 'type',
			_item_type: 'item_type',
			maxlength: 'max_length',
			min_value: 'min',
			max_value: 'max',
			_perm: 'perm',
			_ref_name: 'reference_name',
		};

		for (var i in map) {
			if (xml.attr(map[i]) == undefined) continue;
			property[i] = xml.attr(map[i]);
		}

		if (property._perm)
			property._perm = property._perm.split(' ');
		else
			property._perm = [];

		// Pull text content of children of the property node
		map = {
			_label: 'description',
			_default_value: 'default'
		};

		for (var i in map) {
			var node = $(map[i], xml);
			if (!node.length) continue;
			property[i] = node.text();
		}

		if (!property._label)
			property._label = property.name;

		// Get key value maps for multiple choice properties
		map = {
			choices: 'choice'
		};

		for (var i in map) {
			var nodes = $(map[i], xml);
			if (!nodes.length) continue;
			property[i] = [];
			nodes.each(function(){
				property[i].push({value: $(this).attr('value'), text: $(this).text()});
			});
		}

		self.prop_map[property.name] = property;

		return property;
	});

	this.query_ldb = function(filters, fnc) {
		var tbl = botoweb.ldb.tables[this.name];
		var query = new botoweb.sql.Query(tbl);

		query.apply_bw_filters(filters, tbl);

		// Perform query asynchronously
		setTimeout(function() {

		}, 1);
	};

	this.find = function(filters, fnc, opt){
		if (!opt) opt = {};

		if (botoweb.ldb.dbh && !opt.no_ldb) {
			return this.query_ldb(filters, fnc);
		}

		var self = this;

		botoweb.find(botoweb.env.base_url + this.href, filters, $.map(botoweb.env.routes, function(m) { return m.obj }).join(', '), function(data, page, count){
			if(fnc){
				var objects = [];
				for(var x=0; x < data.length; x++){
					var model = botoweb.env.models[data[x].model];
					objects[x] = new botoweb.Model(model.href, model.name, data[x]);
				}
				return fnc(objects, page, count);
			}
		});
	}

	this.query = function(query, fnc, opt){
		if (!opt) opt = {};

		if (botoweb.ldb.dbh && !opt.no_ldb) {
			return this.query_ldb(query, fnc);
		}

		var self = this;
		botoweb.query(botoweb.env.base_url + this.href, query, $.map(botoweb.env.routes, function(m) { return m.obj }).join(', '), function(data, page, count){
			if(fnc){
				var objects = [];
				for(var x=0; x < data.length; x++){
					var model = botoweb.env.models[data[x].model];
					objects[x] = new botoweb.Model(model.href, model.name, data[x]);
				}
				return fnc(objects, page, count);
			}
		});
	}
	this.all = function(fnc, opt){
		return this.find([], fnc, opt);
	}

	this.count = function(query, fnc){
		botoweb.count(botoweb.env.base_url + this.href, query, function(count) {
			fnc(count);
		});
	}

	this.cache = function(obj) {
		self._cache[obj.id] = obj;
		clearTimeout(self.cache_timeouts[obj.id]);
		self.cache_timeouts[obj.id] = setTimeout(function() {
			delete self._cache[obj.id];
		}, 10000);
		return self._cache[obj.id];
	}


	this.get = function(id, fnc){
		var self = this;
		if (self._cache[id]) {
			fnc(self._cache[id]);
			return;
		}

		if (botoweb.ldb.dbh) {
			return this.query_ldb({id: id}, fnc);
		}

		botoweb.get_by_id(botoweb.env.base_url + self.href, id, function(obj){
			if(obj){
				return fnc(self.cache(new botoweb.Model(self.href, self.name, obj)));
			}
		});
	}

	this.save = function(data, fnc){
		ref = botoweb.env.base_url + this.href;
		method = "POST";
		if("id" in data && typeof data.id != 'undefined'){
			delete self._cache[data.id];
			ref += ("/" + data.id);
			delete(data['id']);
			method = "PUT";
		}
		delete self._cache[data.id];
		return botoweb.save(ref, this.name, data, method, fnc);
	}

	//
	// Delete this object
	//
	this.del = function(id, fnc){
		ref = this.href;
		return botoweb.del(botoweb.env.base_url + ref + "/" + id, function(x) {
			/*$(self.data_tables[id]).each(function() {
				this.table.del(this.row);
			});*/
			delete self.data_tables[id];
			delete self._cache[id];
			return fnc(x);
		});
	}

};

/**
 * Model wrapper
 *
 * @constructor
 */
botoweb.Model = function(href, name, properties){
	var self = this;

	self._DEBUG_OBJECT_INSTANCE = 1;
	self.href = href;
	self.name = name;
	self.properties = properties;
	self.id = properties.id;
	self.model = properties.model;

	self.follow = function(property, fnc, filters) {
		var props = self.properties[property];

		if (typeof props == 'undefined')
			return;

		if (!$.isArray(props))
			props = [props];

		$(props).each(function() {
			if (typeof this.id != 'undefined') {
				if (this.item_type) {
					botoweb.env.models[this.item_type].get(this.id, function(obj) {
						return fnc([obj], 0, 1);
					});
				}
				return;
			} else {
				botoweb.query(botoweb.env.base_url + self.href + '/' + self.id + '/' + this.href, filters, '*>*[id]', function(data, page, count) {
					if(fnc){
						var objects = [];
						for(var x=0; x < data.length; x++){
							var model = botoweb.env.models[data[x].model];
							objects[x] = new botoweb.Model(model.href, model.name, data[x]);
						}
						return fnc(objects, page, count);
					}
				});
			}
		});
	}

	self.load = function(property, fnc) {
		var props = self.properties[property];

		if (typeof props == 'undefined')
			return;

		if (!$.isArray(props))
			props = [props];

		$(props).each(function() {
			if (this.type == 'blob') {
				botoweb.ajax.get(botoweb.env.base_url + self.href + '/' + self.id + '/' + this.href, fnc);
			}
		});
	}
};