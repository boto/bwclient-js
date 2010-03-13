/**
 * JavaScript library used to parse XML received from botoweb.
 *
 * @author Ian Paterson
 */
(function () {

botoweb.xml = {
	/**
	 * Parses API XML that defines a model's properties.
	 *
	 * @return The corresponding model
	 * @type botoweb.Model
	 */
	to_model: function (xml) {
		xml = $(xml);

		var methods = {};

		// Parse method names and descriptions
		xml.find('methods *').each(function () {
			methods[this.nodeName] = $(this).text()
		});

		var model = new botoweb.Model(
			xml.attr('name'),
			xml.find('href:first').text(),
			methods
		);

		model.set_props(xml.find('properties property').map(function () {
			var tags = $(this);
			var opt = {};

			// Pull attributes from the property node
			var map = {
				item_type: 'item_type',
				max_length: 'max_length',
				min_value: 'min',
				max_value: 'max',
				ref_name: 'reference_name',
				href: 'href'
			};

			$.each(map, function (a, b) {
				if (tags.attr(b) != undefined)
					opt[a] = tags.attr(b);
			});

			// Pull text content of children of the property node
			map = {
				label: 'description',
				default_value: 'default'
			};

			$.each(map, function (a, b) {
				var node = tags.find(b);

				if (node.length)
					opt[a] = node.text();
			});

			// Get key value maps for multiple choice properties
			map = {
				choices: 'choice'
			};

			$.each(map, function (a, b) {
				var nodes = tags.find(b);

				if (!nodes.length)
					return;

				opt[a] = [];

				nodes.each(function () {
					opt[a].push({value: $(this).attr('value'), name: $(this).text()});
				});
			});

			var prop = new botoweb.Property(
				tags.attr('name'),
				tags.attr('type'),
				(tags.attr('perm') || '').split(' '),
				model,
				opt
			);

			return prop;
		}));

		return model;
	},

	/**
	 * Parses XML that defines an object's properties. Data is parsed according
	 * to the model definition to ensure consistent representation of all data
	 * types.
	 *
	 * @return The corresponding object
	 * @type botoweb.Object
	 */
	to_obj: function(xml, opt) {
		if (!opt) opt = {};

		xml = $(xml);

		var model = botoweb.env.models[opt.item_type || xml.get(0).tagName];

		// If the object is cached, return it unless we have are reloading the
		// object.
		if (!opt.no_cache && model.objs[xml.attr('id')])
			return model.objs[xml.attr('id')];

		var data = {};

		$.each(model.props, function() {
			// May match more than one!
			var tags = xml.find('> ' + this.meta.name);

			var prop = new this.instance();

			if (prop.is_type('reference', 'blob', 'query')) {
				prop.data = tags.map(function (i, tag) {
					tag = $(tag);
					return {
						// The value is null until the object is loaded
						val: null,

						href: tag.attr('href'),
						type: tag.attr('item_type'),
						id: tag.attr('id')
					};
				});
			}

			else if (prop.is_type('complexType')) {
				prop.data = tags.children().map(function(i, tag) {
					tag = $(tag);
					return {
						key: tag.attr('name'),
						type: tag.attr('type'),
						val: tag.text()
					};
				});
			}

			else {
				prop.data = tags.map(function(i, tag) {
					return { val: $(tag).text() };
				});
			}

			data[this.meta.name] = prop;
		});

		return new botoweb.Object(xml.attr('id'), model, data);
	},

	from_obj: function (model_name, data) {
		var doc = document.implementation.createDocument('', model_name, null);
		var obj = doc.documentElement;
		var model = botoweb.env.models[model_name];

		$.each(data, function (name, val) {
			if (val == undefined)
				return;

			if (!(name in model.prop_map))
				return;

			var model_prop = model.prop_map[name];
			var node = $(doc.createElement(pname));
			node.attr('type', type);

			(to_xml[model_prop.meta.type] || to_xml.def)(val, node, obj, model_prop);
		});

		return doc;
	},

	to_xml: {
		def: function (val, node, parent) {
			$.each(val, function () {
				node.clone().text(this.id || this.val).appendTo(parent);
			});
		},
		complexType: function (val, node, parent) {
			$.each(val, function () {
				$('<mapping/>').attr({
					name: this.key,
					type: 'string'
				}).text(this.val).appendTo(node);
			});
			node.appendTo(parent);
		}
	}
};

var $xml = botoweb.xml;
var $env = botoweb.env;
})();