/**
 * JavaScript library used to parse XML received from botoweb.
 *
 * @author Ian Paterson
 */
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
		var data = {};

		$.each(model.props, function() {
			// May match more than one!
			var tags = xml.find('> ' + this.meta.name);

			var prop = new this.instance();

			if (prop.is_type('reference', 'blob')) {
				prop.data = {
					// The value is null until the object is loaded
					value: null,

					href: tags.attr("href"),
					id: tags.attr("id")
				};
			}

			else if (prop.is_type('list')) {
				prop.data = [];

				tags.each(function() {
					prop.data.push(tags.text());
				});
			}

			else if (prop.is_type('complexType')) {
				prop.data = [];

				tags.children().each(function() {
					prop.data.push({
						name: tags.attr('name'),
						type: tags.attr('type'),
						value: tags.text()
					});
				});
			}

			else {
				prop.data = tags.text();
			}

			data[this.meta.name] = prop;
		});

		return new botoweb.Object(xml.attr('id'), model, data);
	}
};
