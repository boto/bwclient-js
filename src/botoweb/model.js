/**
 * Structures object and model data and provides abstractions for loading and
 * manipulating the data.
 *
 * @author Chris Moyer
 */

/**
 * Base model object
 *
 * @constructor
 */
botoweb.Model = function (name, href, methods, props) {

	this._DEBUG_MODEL_INSTANCE = 1;
	this.name = name;
	this.href = href;
	this.methods = methods;
	this.props = [];
	this.prop_map = {};

	this.set_props = function(props) {
		var self = this;
		this.props = props;
		this.prop_map = {};

		$.each(this.props, function() {
			self.prop_map[this.meta.name] = this;
		});
	}

	this.query_ldb = function(filters, fnc) {
		var tbl = botoweb.ldb.tables[this.name];
		var query = new botoweb.sql.Query(tbl);

		query.apply_bw_filters(filters, tbl);

		// Perform query asynchronously
		setTimeout(function() {
			botoweb.ldb.dbh.transaction(function (txn) {
				query.all(txn, function(results) {
					// TODO Convert results to objects
				});
			});
		}, 1);
	};

	this.find = function(filters, fnc, opt){
		if (!opt) opt = {};

		if (botoweb.ldb.dbh && !opt.no_ldb) {
			return this.query_ldb(filters, fnc);
		}

		botoweb[(opt.query) ? 'query' : 'find'](botoweb.env.base_url + this.href, filters, botoweb.env.model_names, fnc);
	}

	this.query = function(query, fnc, opt) {
		return this.find(query, fnc, $.extend(opt, {query: 1}));
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
				return fnc(self.cache(new botoweb.Object(self.href, self.name, obj)));
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
