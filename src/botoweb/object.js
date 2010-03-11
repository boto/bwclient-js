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
		if ('obj' in prop)
			prop.obj = self;
	});

	self.follow = function(prop_name, fnc, filters, opt) {
		if (!opt) opt = {};

		var prop = self.data[prop_name];

		if (!prop)
			return;

		$.each(prop.val(), function(i, val) {
			// If the val is not undefined we have already loaded it.
			if (val.val !== undefined)
				return fnc(val.val || [], 0, 0);

			if (prop.is_type('reference')) {
				if (val.id) {
					var model = botoweb.env.models[prop.meta.item_type];

					if (model.objs[val.id])
						return fnc([model.objs[val.id]], 0, 1);
					else {
						model.get(val.id, function(objs) {
							return fnc([objs], 0, 1, true);
						}, opt);
					}
				}
				else
					fnc([], 0, 0);
				return;
			}
			else {
				opt.item_type = prop.meta.item_type;

				botoweb.query(botoweb.util.url_join(botoweb.env.base_url, self.model.href, self.id, prop.meta.name),
					filters, prop.meta.name + ' > *[id]', fnc, opt
				);
			}
		});
	}

	this.update = function (data, fnc) {
		botoweb.save(
			botoweb.util.url_join(botoweb.env.base_url, self.model.href, self.id),
			self.model.name, data, 'PUT', fnc
		);
	};

	this.load = function(property, fnc) {
		var props = self.data[property];

		if (typeof props == 'undefined')
			return;

		if (!$.isArray(props))
			props = [props];

		$(props).each(function() {
			if (this.type == 'blob') {
				botoweb.ajax.get(botoweb.util.url_join(botoweb.env.base_url, self.href, self.id, this.href), fnc);
			}
		});
	};

	this.del = function() {
		$(this).trigger('delete');
	};
};