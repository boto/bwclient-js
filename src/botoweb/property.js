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

	var self = this;
	var model_prop = this;
	var is_list = false;

	this.onload = [];
	this.obj_model = model;

	if (opt.item_type == 'str')
		opt.item_type = 'string';

	// Lists are not treated as their own type since this adds an extra
	// unnecessary level of complexity. Instead the meta.list property will be
	// true if the property was defined as a list.
	if (type == 'list') {
		is_list = true;

		if (opt.item_type && opt.item_type in botoweb.env.models)
			type = 'reference';
		else
			type = opt.item_type;
	}

	// Both dates and dateTimes can represent dates, dateTime can also represent
	// a time. We handle these identically on the front-end
	if (type == 'date') {
		type = 'dateTime';

		opt.date_only = true;
	}

	/**
	 * Creates a new object. Expects data to be in the right format.
	 *
	 * @constructor
	 */
	this.instance = function (data, opt) {
		opt = opt || {};
		var self = this;

		this.data = data;

		if (!this.data || this.data.length == 0) {
			// If the data MUST be loaded from botoweb to know if there is a
			// value, then default it to undefined to signify "unknown"
			if (model_prop.meta.no_store || model_prop.is_type('query', 'blob'))
				this.data = [{val: undefined}];
			// Dummy obj will lazily load any property if necessary.
			else if (opt.dummy_obj)
				this.data = [{val: undefined}];
			// Otherwise default it to null to signify "no value"
			else
				this.data = [{val: null}];
		}

		if (!$.isArray(this.data))
			this.data = [this.data];

		this.meta = model_prop.meta;

		self.val = model_prop.val;
		self.is_type = model_prop.is_type;
		self.load = model_prop.load;
		self.toString = model_prop.toString;
		self.to_sql = model_prop.to_sql;
		self.format_val = model_prop.format_val;
		self.is_loaded = model_prop.is_loaded;

		if (this.load) {
			this.obj_id = undefined;
			this.obj_model = model;

			/**
			 * Holds functions that are awaiting the data to be loaded. A simple
			 * array avoids the overhead of jQuery events.
			 */
			this.onload = [];
		}
	};

	this.format_val = function (data, opt) {
		if ('val' in data && data.val !== null && data.val !== undefined){
			var retval =  data.val.toString();

			// No HTML parsing should be done on raw data
			if (opt.sql) {
				return retval;
			}

			// Attempt to trim off any leading/trailing whitespaces
			// If this causes issues, just ignore that and move on
			try{
				retval = retval.trim();
			} catch(e){}

			// Handle Email Addresses
			if(/^[a-zA-Z\.0-9_\+\-]+@[a-zA-Z\.0-9\-]*$/.test(retval)){
				var href = botoweb.env.cfg.format.email_href(retval, this, this.obj);
				retval = "<a href='"+href+"' target='_blank'>"+retval+"</a>";
			} else if (/^(feed|ftps|sftp|ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?$/.test(retval)){
				retval = "<a href='"+retval+"' target='_blank'>"+retval+"</a>";
			}
			return retval;
		}
	};


	/**
	 * Actually returns an array which can either be used as a string with
	 * its native toString, or it can be joined with whatever is desired (line
	 * breaks, commas, etc).
	 */
	this.toString = function (wantarray, opt) {
		if (!this.data)
			return null;

		var values = [];
		var self = this;
		opt = opt || {};

		$.each(this.data, function () {
			if (this)
				values.push(self.format_val(this, opt));
		});

		if (wantarray)
			return values;

		return values.join(opt.separator || ', ');
	};

	switch (type) {
		case 'complexType':
			/**
			 * Loads data from a complexType or list database table. It is not
			 * necessary to load complexType or list data from botoweb because
			 * the data is included in the XML.
			 */
			this.load = function (fnc, opt) {
				opt = opt || {};

				if (fnc) {
					this.onload.push(fnc);

					// We already started to load the data
					if (this.onload.length > 1)
						return;
				}

				var self = this;

				if (this.meta.no_store) {
					botoweb.Object.load(this.obj_model, (opt.obj || this.obj_id), this.meta.name, function (prop) {
						// onload contains callbacks which are waiting on this data
						// More callbacks may be added asynchronously while
						// these functions are running.
						while (self.onload && self.onload.length) {
							var fncs = self.onload;

							// The onload functions are no longer needed but must
							// be cleared BEFORE beginning to iterate the existing
							// fncs. Otherwise, some which load while these callbacks
							// are executing will never run.
							self.onload = [];

							$.each(fncs, function() {
								this(prop.data, self);
							});
						}
					});

					return;
				}

				var tbl = botoweb.ldb.tables[botoweb.ldb.prop_to_table(this)];

				botoweb.ldb.dbh.transaction(function (txn) {
					new botoweb.sql.Query(
							tbl.c.val,
							(('key' in tbl.c) ? tbl.c.key : tbl.c.id),
							(('type' in tbl.c) ? tbl.c.type : tbl.c.id)
						)
						.filter(tbl.c.id.cmp(self.obj_id))
						.all(txn, function (rows) {
							var data = $.map(rows, function (row) {
								var data = { val: row.val };

								if ('type' in row)
									data.type = row.type;
								if ('key' in row)
									data.key = row.key;

								return data;
							});

							// onload contains callbacks which are waiting on
							// this data
							if (self.onload.length)
								$.each(self.onload, function() { this(data, true); });

							// The onload functions are no longer needed
							self.onload = [];
						});
				});
			};

			this.format_val = function (val, opt) {
				opt.separator = '<br />';
				return val.key + ' &rarr; ' + (val.val || 'none');
				//console.log(val);
				//return "<tr><td>" + val.key + ' </td><td> ' + (val.val || 'none') + " </td></tr>";
			}
			break;

		case 'reference':
			this.toString = function (wantarray) {
				var ids = $.map(this.data, function (item) { return item.id })

				if (wantarray)
					return ids;

				return ids.join(', ');
			};

		case 'query':
			/**
			 * Loads a reference or query type, data may come from botoweb or
			 * from the local database.
			 */
			this.load = function (fnc, opt) {
				opt = opt || {};

				if (fnc) {
					this.onload.push(fnc);

					// We already started to load the data
					if (this.onload.length > 1 || this.loading)
						return;
				}

				var self = this;
				var async = false;

				function process (objs) {
					var data = [];

					if (objs.length) {
						$.each(objs, function () {
							data.push({ val: this, id: this.id });
						});
					}
					// null signifies that we tried to load the value and it
					// does not exist
					else
						data.push({ val: null });

					// onload contains callbacks which are waiting on this data
					// More callbacks may be added asynchronously while
					// these functions are running.
					while (self.onload && self.onload.length) {
						var fncs = self.onload;

						// The onload functions are no longer needed but must
						// be cleared BEFORE beginning to iterate the existing
						// fncs. Otherwise, some which load while these callbacks
						// are executing will never run.
						self.onload = [];

						$.each(fncs, function() {
							this(data, self);
						});
					}

					self.loading = false;
				}

				this.loading = true;

				botoweb.Object.follow(this.obj_model, (opt.obj || this.obj_id), this.meta.name, process, opt.filter, opt);

				async = true;
			};
			break;
		case 'dateTime':
			this.format_val = function (data, opt) {
				if (!data.val)
					return '';

				if (opt.sql)
					return data.val.toString();

				// Check if it is already in the human-friendly format
				if (data.val.toString().indexOf('/') >= 0)
					return data.val.toString();

				return botoweb.util.from_timestamp(data.val.toString());
			};
			break;
		case 'boolean':
			this.format_val = function (data, opt) {
				switch (data.val) {
					case '1':
					case 'True':
						if (opt.sql)
							return 'True';
						return 'Yes';
					default:
						if (opt.sql)
							return 'False';
						return 'No';
				}
				return '';
			};
			break;
		case 's3key':
			this.format_val = function (data, opt) {
				var base_url = document.location.protocol + "//" + document.location.hostname + "/" + botoweb.env.base_url;
				if(/Chrome/.test(navigator.userAgent)){
					base_url = "view-source:" + base_url;
				}
				return "<a target='_blank' href='" + base_url + "/" + this.obj_model.href + "/" + (opt.obj || this.obj_id) + "/" + this.meta.name + "'>View</a>";
			};
			break;

	}

	this.to_sql = function () {
		return this.toString(false, { sql: true });
	}

	if (is_list) {
		var load = this.load;

		this.load = function (fnc, opt) {
			if (!model.local) {
				if (load)
					return load.call(this, fnc, opt);
				else
					return fnc(this.data, true);
			}

			// The list may have already been queried in which case the list
			// count has been replaced by actual data.
			if (this.data[0].count === undefined) {
				if (load)
					return load.call(this, fnc, opt);
				else
					return fnc(this.data, true);
			}

			// The count of list or complexType items is cached. If it is
			// zero (null) we don't need to load anything.
			if (!this.data[0].count) {
				this.data[0].val = null;
				return fnc([], false);
			}

			this.onload.push(fnc);

			// We already started to load the data
			if (this.onload.length > 1 || this.loading)
				return;

			this.loading = true;

			var self = this;

			var tbl = botoweb.ldb.tables[botoweb.ldb.prop_to_table(this)];

			botoweb.ldb.dbh.transaction(function (txn) {
				new botoweb.sql.Query(
						tbl.c.val,
						tbl.c.key,       // may not exist
						tbl.c.val__type  // may not exist
					)
					.filter(tbl.c.id.cmp(self.obj_id))
					.all(txn, function (rows) {
						self.data = $.map(rows, function (row) {
							var data = { val: undefined };

							if (self.is_type('reference'))
								data.id = row.val;
							else
								data.val = row.val;

							if ('val__type' in row)
								data.type = row.val__type;
							if ('key' in row)
								data.key = row.key;

							return data;
						});

						self.loading = false;

						// Call the original load fnc
						if (load)
							load.call(self, null, opt);
						else {
							// More callbacks may be added asynchronously while
							// these functions are running.
							while (self.onload && self.onload.length) {
								var fncs = self.onload;

								self.onload = [];

								$.each(fncs, function() {
									this(self.data, true);
								});
							}
						}
					});
			});
		}
	}

	// Calculated properties must always be loaded from the server
	if (opt.no_store && !this.load) {
		this.load = function (fnc, opt) {
			opt = opt || {};

			if (fnc) {
				this.onload.push(fnc);

				// We already started to load the data
				if (this.onload.length > 1 || this.loading)
					return;
			}

			this.loading = true;

			var self = this;

			botoweb.Object.load(this.obj_model, (opt.obj || this.obj_id), this.meta.name, function (prop) {
				while (self.loading && self.loading.length) {
					var fncs = self.onload;

					self.onload = [];

					$.each(fncs, function () {
						this(prop.data);
					});
				}

				self.loading = false;
			}, opt);
		};
	}

	/**
	 * Provides the value of the property either to a callback function or as a
	 * direct return value.
	 */
	this.val = function (fnc, opt) {
		if (fnc) {
			// Don't try to load anything on a model property which has no data
			if (!('data' in this))
				return fnc([]);

			// Either the data need not be loaded or it has already been loaded
			// VERY IMPORTANT: If the object does not have a value for this
			// property, the val property will be null. undefined is used ONLY
			// when the value has not yet been loaded. If val is null or
			// anything else, this statement will evaluate to true.
			if (this.is_loaded())
				return fnc(this.data, this);

			// Load the data as defined by its type
			if (this.load)
				this.load(fnc, opt);
			else
				return fnc(this.data, this);
		}

		// VERY IMPORTANT: This may be undefined which means that the value has
		// not been loaded (not necessarily that there is no value). Use a
		// callback whenever possible to ensure that the correct data is
		// returned.
		return this.data;
	};

	this.is_loaded = function () {
		if (!this.data)
			return false;

		if (this.data.length == 0 || this.data[0].val === undefined)
			return false;

		return true;
	}

	/**
	 * Returns the property's type (usually just used as a true value) if the
	 * type is found in its arguments.
	 */
	this.is_type = function () {
		var type = this.meta.type;

		for (var i = 0; i < arguments.length; i++) {
			if (type == arguments[i] || (arguments[i] == 'list' && this.meta.list))
				return type;
		}

		return false;
	};

	this.meta = {
		_DEBUG_PROPERTY_INSTANCE: 1,
		name: name || '',
		type: type || '',
		perm: perm || [],
		list: is_list,
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

	// Create a default label by converting _ to space and title casing
	if (!this.meta.label) {
		this.meta.label = this.meta.name.replace(/(^|_)(\w)/g, function (m, space, chr) {
			return space.replace('_', ' ') + chr.toUpperCase();
		});
	}

	if (this.is_type('query')) {
		setTimeout(function () {
			self.meta.ref_props = [];

			var ref_model = botoweb.env.models[self.meta.item_type];

			if (!ref_model)
				return;

			self.meta.write = false;
			self.meta.read = false;

			// Query may map to multiple values in another object
			$.each(self.meta.refs, function () {
				var ref_prop = ref_model.prop_map[this];

				if (!ref_prop) return;

				self.meta.ref_props.push(ref_prop);

				if (ref_prop.meta.read)
					self.meta.read = true;
				if (ref_prop.meta.write)
					self.meta.write = true;
			});
		}, 50);
	}
};
