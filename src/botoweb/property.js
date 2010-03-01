/**
 * Structures properties and creates a factory for construction of object data
 * properties.
 *
 * @author Ian Paterson
 */

/**
 * Represents a property of a model but also returns a constructor which is
 * custom built based on the property type.
 *
 * @constructor
 */
botoweb.Property = function(name, type, perm, model, opt) {
	opt = opt || {};

	var model_prop = this;

	/**
	 * Creates a new object
	 *
	 * @constructor
	 */
	this.instance = function (data) {
		var self = this;

		self.data = model_prop.format_data(data) || {};

		self.meta = model_prop.meta;

		$.each(['equals','is_type','val','toString'], function () {
			self[this] = model_prop[this];
		});
	};

	this.toString = function () {
		return this.val();
	};

	switch (type) {
		case 'list':
			this.equals = function(other) {
				if (!this.is_type(other.type))
					return false;

				for (var i in this.data) {
					if (i >= other.data.length || this.data != other.data[i])
						return false;
				}

				return true;
			};

			this.val = function() {
				return this.data;
			};

			this.toString = function () {
				return $.makeArray(this.val());
			};
			break;

		case 'complexType':
			this.equals = function(other) {
				if (!this.is_type(other.type))
					return false;

				for (var i in this.data) {
					if (i >= other.data.length
						|| this.data[i].name != other.data[i].name
						|| this.data[i].value != other.data[i].value
					)
						return false;
				}

				return true;
			};
			break;

		case 'reference':
			this.equals = function(other) {
				if (!this.is_type(other.type))
					return false;

				return this.data.id == other.data.id
					&& this.data.href == other.data.href;
			};

			this.format_data = function (data) {
				return {id: data};
			};

			this.toString = function () {
				return this.data.id;
			};
			break;

		case 'query':
			this.equals = function(other) {
				return false;
			};
			break;
	}

	this.equals = this.equals || function (other) {
		return this.data.value == other.data.value;
	};

	this.val = this.val || function () {
		return this.data.value || this.data;
	};

	this.format_data = this.format_data || function (data) {
		return data;
	}

	this.is_type = function () {
		var type = this.meta.type;

		for (var i = 0; i < arguments.length; i++) {
			if (type == arguments[i])
				return type;
		}

		return false;
	};

	this.meta = {
		_DEBUG_PROPERTY_INSTANCE: 1,
		name: name || '',
		type: type || '',
		perm: perm || [],
		model: model,
		read: false,
		write: false
	};

	if ($.inArray('read', this.meta.perm) >= 0)
		this.meta.read = true;

	if ($.inArray('write', this.meta.perm) >= 0)
		this.meta.write = true;

	// Copy any optional data
	$.extend(this.meta, opt);
};
