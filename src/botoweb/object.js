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

	self.follow = function(prop, fnc, filters, opt) {
		var data = self.data[prop];

		if (typeof data == 'undefined')
			return;

		if (!$.isArray(data))
			data = [data];

		$.each(data, function(i, prop) {
			if (prop.meta.type == 'reference') {
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

				botoweb.query(botoweb.util.url_join(botoweb.env.base_url, self.model.href, self.id, prop.meta.href),
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