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

		var values = prop.val();

		if (!values || !values.length)
			return;

		// If the val is not undefined we have already loaded it.
		if (values[0].val !== undefined)
			return fnc(values || [], 0, 0);

		var objs = [];
		var remaining = values.length;

		if (prop.is_type('reference')) {
			$.each(values, function(i, val) {
				if (val.id) {
					if (!val.type)
						alert('NO TYPE: ' + prop_name + ' with id ' + val.id);
					var model = botoweb.env.models[val.type];

					if (model.objs[val.id]) {
						objs.push(model.objs[val.id]);
						remaining--;
					}
					else {
						model.get(val.id, function(o) {
							objs.push(o);

							remaining--;
							if (remaining <= 0)
								fnc(objs, 0, objs.length, true);
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

			botoweb.query(botoweb.util.url_join(botoweb.env.base_url, self.model.href, self.id, values[0].href),
				filters, prop.meta.name + ' > *[id]', fnc, opt
			);
		}

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