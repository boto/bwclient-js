/**
 * JavaScript library used to parse JSON received from botoweb.
 *
 * @author Ian Paterson
 */
(function () {

botoweb.json = {
	/**
	 * Parses API JSON that defines a model's properties.
	 *
	 * @return The corresponding model
	 * @type botoweb.Model
	 */
	to_model: function (data) {
		// TODO Not yet supported in botoweb or bwclient
		console.error('to_model is not yet supported for JSON.');
	},

	/**
	 * Parses JSON that defines an object's properties. Data is parsed according
	 * to the model definition to ensure consistent representation of all data
	 * types.
	 *
	 * @return The corresponding object
	 * @type botoweb.Object
	 */
	to_obj: function(data, opt) {
		if (!opt) opt = {};

		if (!('__id__' in data))
			return;

		var model;

		if (data.__type__ in botoweb.env.models)
			model = botoweb.env.models[data.__type__];

		// Use item_type ONLY if the items returned do not specify their model,
		// otherwise using item_type can cause strange pseudo typecasting when
		// we query a superclass and receive subclassed objects.
		else
			model = botoweb.env.models[opt.item_type];

		// If the object is cached, return it unless we are reloading the object
		if (!opt.no_cache && model.objs[data.__id__])
			return model.objs[data.__id__];

		var props = {};

		if (!opt.minimal_parse) {
			if(!model){
				console.error("Model not found: " + data.__type__);
				return;
			}
			$.each(model.props, function() {
				var prop = $json.to_prop(this, data, opt);

				if (prop)
					props[this.meta.name] = prop;
			});
		}

		var obj = new botoweb.Object(data.__id__, model, data, opt);

		if (botoweb.ldb && botoweb.ldb.dbh) {
			botoweb.ldb.cache_props(obj);
		}

		return obj;
	},

	/**
	 * Returns a new property based on the XML data.
	 *
	 * @return The corresponding property
	 * @type botoweb.Property
	 */
	to_prop: function (model_prop, data, opt) {
		opt = opt || {};

		if (!(model_prop.meta.name in data))
			return;

		var d = null;

		var values = data[model_prop.meta.name];

		if (!$.isArray(values))
			values = [values];

		// Calculated properties are not included in the XML
		if (model_prop.meta.calculated && !opt.parse_calculated) {
			d = $.map(values, function(val, i) {
				return {
					// The value is undefined until the object is loaded
					val: undefined,

					href: val.__href__
				};
			});
		}
		else if (model_prop.is_type('reference', 'blob', 'query')) {
			d = $.map(values, function(val, i) {
				val = $(val);
				return {
					// The value is undefined until the object is loaded
					val: undefined,

					href: val.__href__,
					type: val.__type__,
					id: val.__id__
				};
			});
		}

		else if (model_prop.is_type('complexType')) {
			d = $.map(values, function(val, key) {
				return {
					key: key,
					type: 'string', // TODO is type of complexType item necessary?
					val: val
				};
			});
		}

		else {
			d = $.map(values, function(val, i) {
				return { val: val };
			});
		}

		// Create an instance once the data is gathered, any data that
		// is missing will be filled with defaults by the constructor.
		return new model_prop.instance(d);
	},

	from_obj: function (model_name, data) {
		var obj = {};
		var model = botoweb.env.models[model_name];

		$.each(data, function (name, val) {
			if (val == undefined)
				return;

			if (!(name in model.prop_map) && name != 'id')
				return;

			var model_prop = model.prop_map[name] || {meta: {}};

			var type = 'def';

			if (model_prop)
				type = model_prop.meta.type;

			obj[name] = ($json.to_json[type] || $json.to_json.def)(val, model_prop);
		});

		return doc;
	},

	to_json: {
		def: function (val, prop) {
			var data = $.map(val, function (item) {
				// Support reference and query types
				if (item.id) {
					return {
						__type__: item.type,
						__id__: item.id
					};
				}

				// Default integers to 0. NOTE: this makes it impossible to
				// determine whether the user typed 0 or left the field blank.
				if (item.type == 'integer') {
					if (!item.val)
						item.val = 0;

					// Ensure we send a number
					else
						item.val *= 1;
				}


				return $util.normalize_string(item.val || null);
			});

			return $json.to_json._list(data, prop);
		},
		/**
		 * Converts empty arrays to null, flattens 1 element arrays, or returns
		 * multi-element array.
		 */
		_list: function (data, prop) {
			if (data.length == 0)
				return null;
			if (data.length == 1 && !prop.meta.list)
				return data[0];

			return data;
		},
		complexType: function (val) {
			var map = {};

			$.each(val, function () {
				map[$util.normalize_string(this.key)] = $util.normalize_string(this.val);
			});

			return map;
		},
		dateTime: function (val) {
			var data = $.map(val, function (item) {
				var ts = '';

				if (item.val)
					ts = $util.timestamp(item.val);

				return ts;
			});

			return $json.to_json._list(data);
		},
		'boolean': function (val, prop) {
			var data = $.map(val, function (item) {
				return (item.val == 'True');
			});

			return $json.to_json._list(data, prop);
		}
	}
};

var $json = botoweb.json;
var $env = botoweb.env;
var $util = botoweb.util;
})();
