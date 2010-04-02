/**
 * Structures object data and provides abstractions for loading the data.
 *
 * @author Ian Paterson
 */

/**
 * Represents an object
 *
 * @constructor
 */
botoweb.Object = function(id, model, data) {
	var self = this;

	self._DEBUG_OBJECT_INSTANCE = 1;
	self.id = id;
	self.model = model;
	self.data = data || {};

	if (typeof self.model == 'string')
		self.model = botoweb.env.models[self.model];

	self.model.objs[self.id] = self;

	$.each(self.model.props, function () {
		if (!(this.meta.name in self.data))
			self.data[this.meta.name] = new this.instance();
	});

	$.each(self.data, function (i, prop) {
		prop.obj = self;
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
					else if (model.objs[val.id]) {
						objs.push(model.objs[val.id]);
						remaining--;
					}
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

				return;
			});

			if (remaining <= 0)
				fnc(objs, 0, objs.length, true);
		}
		else {
			opt.item_type = prop.meta.item_type;

			botoweb.query(botoweb.util.url_join(botoweb.env.base_url, self.model.href, self.id, prop_name),
				filters, prop.meta.name + ' > *[id]', fnc, opt
			);
		}

	}

	this.update = function (data, fnc) {
		var changed = {};
		var changed_any = false;

		$.each(data, function (name, val) {
			var model_prop = self.model.prop_map[name];

			if (!model_prop.meta.write)
				return;

			// Special processing must be done for queries... if an object was
			// previously linked but is no longer, we need to update that object
			// to remove the link.
			if (model_prop.is_type('query')) {
				var ids = {};
				var old = self.data[name].data;

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

			if (diff) {
				if (val.length == 0)
					val.push({});

				changed[name] = val;
				changed_any = true;
			}
		});

		if (changed_any) {
			var is_new = this.unsaved || !this.id;

			if (is_new)
				changed['id'] = [{val:self.id, type:'string'}];

			botoweb.save(
				botoweb.util.url_join(botoweb.env.base_url, self.model.href, ((is_new) ? null : self.id)),
				self.model.name, changed, ((is_new) ? 'POST' : 'PUT'), fnc
			);
		}
		else {
			fnc(this.obj);
		}
	};

	this.save = function (fnc) {
		var data = {};

		$.each(this.data, function (name, prop) {
			if (prop.toString())
				data[name] = prop.data;
		});

		return this.update(data, fnc);
	}

	this.load = function(prop, fnc) {
		var prop = this.data[prop];

		if (typeof prop == 'undefined' || !prop.is_type('blob'))
			return;

		if (prop.data.length && prop.data[0].val === undefined)
			prop.data = [];

		botoweb.ajax.get(botoweb.util.url_join(botoweb.env.base_url, self.model.href, self.id, prop.meta.name), function (data) {
			prop.data.push({val: data});
			fnc(data);
		});
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