/**
 * Structures object data and provides abstractions for loading the data.
 *
 * @author Ian Paterson
 */

(function ($) {

/**
 * Represents an object
 *
 * @constructor
 */
botoweb.Object = function(id, model, data, opt) {
	opt = opt || {};
	var self = this;

	self._DEBUG_OBJECT_INSTANCE = 1;
	self.id = id;
	self.model = model;
	self.data = data || {};
	self.cached = !opt.no_cache;

	if (typeof self.model == 'string')
		self.model = botoweb.env.models[self.model];

	// The cache is just an easy way to access an object instead of parsing its
	// XML or requesting it by ID from botoweb. If an object is cached in this
	// way, it will not be garbage collected. However, if an object is not
	// cached in this way, it still may not be garbage collected.
	if (!opt.no_cache && !botoweb.env.cfg.disable_cache) {
		console.warn('Caching ' + this.model.name + ' ' + this.id);
		self.model.objs[this.id] = this;
		delete self.model.dummy_objs[this.id];
	}

	$.each(self.model.props, function () {
		if (!(self.data[this.meta.name]))
			self.data[this.meta.name] = new this.instance();

		self.data[this.meta.name].obj_id = self.id;
		self.data[this.meta.name].obj_model = self.model;
	});

	self.follow = function(prop_name, fnc, filters, opt) {
		if (!opt) opt = {};

		var prop = self.data[prop_name];

		if (!prop)
			return;

		var values = prop.val();

		if (!values || !values.length)
			return fnc([], 0, 0);

		// If the val is not undefined we have already loaded it.
		if (values[0].val !== undefined)
			return fnc(values || [], 0, 0);

		var objs = [];
		var remaining = values.length;

		if (prop.is_type('reference')) {
			$.each(values, function(i, val) {
				if (val.id) {
					var model = botoweb.env.models[val.type];

					if (!model) {
						remaining--;
						return;
					}

					if (val.id == 'None') {
						remaining--;
					}
					// Load memory cached object
					else if (model.objs[val.id]) {
						objs.push(model.objs[val.id]);
						remaining--;
					}
					// Load only cached data by id, make a dummy object
					else if (opt.dummy_obj && botoweb.ldb) {
						if (model.dummy_objs[val.id]) {
							objs.push(model.dummy_objs[val.id]);
							remaining--;
						}
						else {
							botoweb.ldb.get_cached_props(model, val.id, function (data) {
								var obj = new model.instance(data, val.id);
								model.dummy_objs[val.id] = obj;
								objs.push(obj);

								remaining--;
								if (remaining <= 0)
									fnc(objs, 0, objs.length);
							});
						}
					}
					// Load full object by id
					else {
						model.get(val.id, function(o) {
							objs.push(o);

							remaining--;
							if (remaining <= 0)
								fnc(objs, 0, objs.length);
						}, opt);
					}
				}
				else
					remaining--;
			});

			if (remaining <= 0) {
				fnc(objs, 0, objs.length, true);
			}
		}
		else {
			opt.item_type = prop.meta.item_type;

			botoweb.query(botoweb.util.url_join(botoweb.env.base_url, self.model.href, self.id, prop_name),
				filters, prop.meta.name + ' > *[id]', fnc, opt
			);
		}
	}

	this.update = function (data, fnc, opt) {
		opt = $.extend({ old_data: {} }, opt);
		var changed = {};
		var changed_any = false;
		var is_new = this.unsaved || !this.id;

		$.each(data, function (name, val) {
			var model_prop = self.model.prop_map[name];

			if (!model_prop.meta.write)
				return;

			// Special processing must be done for queries... if an object was
			// previously linked but is no longer, we need to update that object
			// to remove the link.
			if (model_prop.is_type('query')) {
				var ids = {};
				var old = opt.old_data[name] || self.data[name].data;

				$.each(val, function () {
					ids[this.val] = 1;
				});

				// Iterate over the query's cached objects
				$.each(old, function () {
					// If the object is not found in the new ids list, clear
					// the property that forms that link.
					if (this.val && !(this.val.id in ids)) {
						var data = {};
						data[model_prop.meta.ref_props[0].meta.name] = [{val:''}];
						this.val.update(data, function () {});
					}
				});

				return;
			}

			if (opt.force) {
				changed[name] = val;
				changed_any = true;
				return;
			}

			var diff = false;
			var old = self.data[name].toString(true);
			var updated = new model_prop.instance(val).toString(true);

			if (!old.length)
				old.push('');

			if (!updated.length)
				updated.push('');

			if (old.length != updated.length)
				diff = true;
			else {
				// Check each new value to see if it is the same as the old, also
				// preserves list order.
				$.each(updated, function (i, v) {
					if (!v && !old[i])
						return;
					if (v == old[i])
						return;

					diff = true;

					// Stop checking
					return false;
				});
			}

			if (diff || is_new) {
				if (val.length == 0)
					val.push({});

				changed[name] = val;
				changed_any = true;
			}
		});

		if (changed_any || is_new) {
			this.clear_reference_data();

			if (is_new)
				changed['id'] = [{val:self.id, type:'string'}];

			var method = ((is_new) ? 'POST' : 'PUT');

			$(botoweb).triggerHandler('log', [{
				method: method,
				op: 'save',
				model: self.model.name,
				id: self.id,
				data: changed,
				local: false
			}]);

			botoweb.save(
				botoweb.util.url_join(botoweb.env.base_url, self.model.href, ((is_new) ? null : self.id)),
				self.model.name, changed, method, fnc
			);
		}
		else {
			fnc(this);
		}
	};

	this.save = function (fnc) {
		var data = {};

		$.each(this.data, function (name, prop) {
			if (prop.toString())
				data[name] = prop.data;
		});

		return this.update(data, fnc);
	};

	this.clear_reference_data = function () {
		$.each(this.data, function () {
			if (this.is_type('reference', 'query')) {
				this.data = [this.data[0]];
				delete this.data[0].val;
			}
		});
	}

	this.load = function(prop, fnc, opt) {
		opt = opt || {};
		var prop = this.data[prop];

		if (typeof prop == 'undefined' || (!prop.is_type('blob') && !prop.meta.no_store))
			return prop;

		botoweb.ajax.get(botoweb.util.url_join(botoweb.env.base_url, self.model.href, self.id, prop.meta.name), function (data, xhr) {
			var ct = xhr.getResponseHeader('Content-type') + '';

			if (ct.indexOf('text/xml') >= 0) {
				// Must send a model prop so that the constructor is available
				var p = botoweb.xml.to_prop(self.model.prop_map[prop.meta.name], $(data).children().first(), { parse_calculated: true });

				if (p) {
					fnc(p);
				}
			}
			else {
				prop.data = [{val: data}];

				fnc(prop);
			}
		}, function () {
			fnc(prop);
		});
	};

	this.val = function(prop, fnc, opt) {
		opt = opt || {};
		var prop = this.data[prop];

		if (typeof prop == 'undefined')
			return;

		prop.val(fnc, $.extend(opt, { obj: this }));
	};

	this.del = function(fnc) {
		$(this).trigger('delete');
		this.model.del(this.id, fnc);
	};

	this.toString = function () {
		if ('name' in this.data)
			return this.data.name.toString();

		return this.model.name + ' Object'
	};
};

var $Object = botoweb.Object;

// Static proxies for object methods allow object functions to be called with
// just the model and object id. Proxy functions load the object and then
// perform the action on it.
$.each(['follow', 'update', 'save', 'load', 'val', 'del'], function (i, fnc_name) {
	$Object[fnc_name] = function () {
		var args = $.makeArray(arguments);
		var model = args.shift();
		var id = args.shift();

		if (!model)
			return;

		// Test if we have been given an actual object - this is a nice shortcut
		// for code which may or may not have a reference to an object, for
		// example: botoweb.Object.val((block.obj || block.obj_id), block.model, ...)
		if (id.id) {
			id[fnc_name].apply(id, args);
			return;
		}

		model.get(id, function (obj) {
			if (obj)
				obj[fnc_name].apply(obj, args);
		}, { no_cache: !self.cached });
	};
});

})( jQuery );
