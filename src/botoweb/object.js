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

	self.follow = function(property, fnc, filters) {
		var props = self.data[property];

		if (typeof props == 'undefined')
			return;

		if (!$.isArray(props))
			props = [props];

		$(props).each(function(prop) {
			if (typeof this.id != 'undefined') {
				if (this.meta.item_type) {
					botoweb.env.models[prop.meta.item_type].get(prop.id, function(obj) {
						return fnc([obj], 0, 1);
					});
				}
				return;
			} else {
				botoweb.query(botoweb.env.base_url + self.href + '/' + self.id + '/' + prop.href,
					filters, '*>*[id]', fnc, {
						item_type: prop.item_type
					}
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