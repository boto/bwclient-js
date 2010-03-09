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
	 * Creates a new object. Expects data to be in the right format.
	 *
	 * @constructor
	 */
	this.instance = function (data, opt) {
		opt = opt || {};
		var self = this;

		this.data = data || [{val: undefined}];

		if (!$.isArray(this.data))
			this.data = [this.data];

		this.meta = model_prop.meta;

		$.each(['is_type','val','load','toString'], function () {
			if (this in model_prop)
				self[this] = model_prop[this];
		});

		if ('load' in this) {
			this.obj = undefined;

			/**
			 * Holds functions that are awaiting the data to be loaded. A simple
			 * array avoids the overhead of jQuery events.
			 */
			this.onload = [];
		}
	};


	/**
	 * Actually returns an array which can either be used as a string with
	 * its native toString, or it can be joined with whatever is desired (line
	 * breaks, commas, etc).
	 */
	this.toString = function (wantarray) {
		var values = [];

		$.each(this.data, function () {
			if ('val' in this && this.val)
				values.push(this.val.toString());
		});

		if (wantarray)
			return values;

		return values.join(', ');
	};

	switch (type) {
		case 'list':
		case 'complexType':
			/**
			 * Loads data from a complexType or list database table. It is not
			 * necessary to load complexType or list data from botoweb because
			 * the data is included in the XML.
			 */
			this.load = function (fnc) {
				// The count of list or complexType items is cached. If it is
				// zero (null) we don't need to load anything.
				if (!this.data[0].count) {
					this.data[0].val = null;
					return fnc([], false);
				}

				this.onload.push(fnc);

				// We already started to load the data
				if (this.onload.length > 1)
					return;

				var self = this;

				var tbl = botoweb.ldb.tables[botoweb.ldb.prop_to_table(this)];

				botoweb.ldb.dbh.transaction(function (txn) {
					new botoweb.sql.Query((('key' in tbl.c) ? tbl.c.key : tbl.c.id), tbl.c.val)
						.filter(tbl.c.id.cmp(self.obj.id))
						.all(txn, function (rows) {
							self.data = $.map(rows, function (row) {
								if ('key' in row)
									return { key: row.key, val: row.val };

								return { val: row.val };
							});

							// onload contains callbacks which are waiting on
							// this data
							if (self.onload.length)
								$.each(self.onload, function() { this(self.data, true); });

							// The onload functions are no longer needed
							delete self.onload;
						});
				});
			};
			break;

		case 'reference':
			this.toString = function (wantarray) {
				var ids = $.map(this.data, function (item) { return item.id })

				if (wantarray)
					return ids;

				return ids.join(', ');
			}

		case 'query':
			/**
			 * Loads a reference or query type, data may come from botoweb or
			 * from the local database.
			 */
			this.load = function (fnc) {
				this.onload.push(fnc);

				// We already started to load the data
				if (this.onload.length > 1)
					return;

				var self = this;

				this.obj.follow(this.meta.name, function (objs, a, b, async) {
					self.data = [];

					if (objs.length) {
						$.each(objs, function () {
							self.data.push({ val: this });
						});
					}
					// null signifies that we tried to load the value and it
					// does not exist
					else
						self.data.push({ val: null });

					// onload contains callbacks which are waiting on this data
					if (self.onload && self.onload.length) {
						$.each(self.onload, function() { this(self.data, async); });

						// The onload functions are no longer needed
						delete self.onload;
					}
				});
			};
			break;
	}

	/**
	 * Provides the value of the property either to a callback function or as a
	 * direct return value.
	 */
	this.val = function (fnc) {
		if (fnc) {
			// Either the data need not be loaded or it has already been loaded
			// VERY IMPORTANT: If the object does not have a value for this
			// property, the val property will be null. undefined is used ONLY
			// when the value has not yet been loaded. If val is null or
			// anything else, this statement will evaluate to true.
			if (this.data.length == 0 || this.data[0].val !== undefined)
				return fnc(this.data);

			// Load the data as defined by its type
			if ('load' in this)
				this.load(fnc);
			else
				return fnc(this.data);
		}

		// VERY IMPORTANT: This may be undefined which means that the value has
		// not been loaded (not necessarily that there is no value). Use a
		// callback whenever possible to ensure that the correct data is
		// returned.
		return this.data;
	};

	/**
	 * Returns the property's type (usually just used as a true value) if the
	 * type is found in its arguments.
	 */
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
