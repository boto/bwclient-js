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

	self.follow = function(prop, fnc, filters, opt) {
		if (!opt) opt = {};

		var data = self.data[prop] || self.model.prop_map[prop];

		if (data === undefined)
			return fnc(null, 0, 0);

		if (!$.isArray(data))
			data = [data];

		$.each(data, function(i, prop) {
			if (prop.is_type('reference')) {
				if (prop.meta.item_type && prop.toString()) {
					botoweb.env.models[prop.meta.item_type].get(prop.toString(), function(obj) {
						if (!$.isArray(obj))
							obj = [obj];

						return fnc(obj, 0, 1);
					}, opt);
				}
				return;
			}
			else {
				opt.item_type = prop.meta.item_type;

				botoweb.query(botoweb.util.url_join(botoweb.env.base_url, self.model.href, self.id, prop.meta.name),
					filters, '*>*[id]', fnc, opt
				);
			}
		});
	}

	this.load = function(property, fnc) {
		var props = self.data[property];

		if (typeof props == 'undefined')
			return;

		if (!$.isArray(props))
			props = [props];

		$(props).each(function() {
			if (this.type == 'blob') {
				botoweb.ajax.get(botoweb.env.base_url + self.href + '/' + self.id + '/' + this.href, fnc);
			}
		});
	};

	this.del = function() {
		$(this).trigger('delete');
	};
};