/**
 * Structures object and model data and provides abstractions for loading and
 * manipulating the data.
 *
 * @author Chris Moyer
 */

/**
 * Base model object
 *
 * @constructor
 */
botoweb.Model = function (name, href, methods, props) {

	var self = this;
	this._DEBUG_MODEL_INSTANCE = 1;
	this.name = name;
	this.href = href;
	this.methods = methods;
	this.ref_props = [];
	this.props = [];
	this.prop_map = {};
	this.local = false;
	this.objs = {};

	this.set_props = function(props) {
		var self = this;
		this.props = props;
		this.prop_map = {};

		$.each(this.props, function() {
			if (this.is_type('query', 'reference'))
				self.ref_props.push(this);

			self.prop_map[this.meta.name] = this;
		});
	}

	this.query_ldb = function(filters, fnc, opt) {
		opt = opt || {};

		var tbl = botoweb.ldb.tables[this.name];
		var query = new botoweb.sql.Query(tbl);

		query.apply_bw_filters(filters, tbl);

		function do_query (txn) {
			var total_results = 0;
			var page = 0;

			function next_page(txn) {
				function get_page(txn) {
					query.page(txn, function(results, page) {
						var data = $.map(results, function (row) { return row[0]; });

						if (opt.one) {
							// We skipped the counting query, set the count now
							total_results = data.length;

							if (data.length)
								data = data[0];
							else {
								// A default action may exist if the target
								// object is not found
								if (opt.not_found) {
									opt.not_found();
									return false;
								}

								data = null;
							}
						}

						return fnc(data, page, total_results, next_page);
					}, page++, opt);
				}

				if (txn)
					get_page(txn);
				else
					botoweb.ldb.dbh.transaction(get_page);
			};

			// No need for a count of results
			if (opt.one) {
				next_page();
			}
			else {
				query.count(txn, function (count) {
					total_results = count;

					next_page(txn);
				});
			}
		}

		if (opt.txn)
			do_query(opt.txn);
		else
			botoweb.ldb.dbh.transaction(do_query);
	};

	this.find = function(filters, fnc, opt){
		opt = $.extend({op: 'find'}, opt);

		var use_local = this.local && botoweb.ldb.dbh && !opt.no_ldb;

		$(botoweb).triggerHandler('log', [{
			method: 'GET',
			op: opt.op,
			model: this.name,
			filters: filters,
			local: use_local
		}]);

		if (use_local) {
			return this.query_ldb(filters, fnc, opt);
		}

		botoweb[opt.op](botoweb.util.url_join(botoweb.env.base_url, this.href), filters, botoweb.env.model_names.join(','), fnc, opt);
	}

	this.query = function(query, fnc, opt) {
		return this.find(query, fnc, $.extend(opt, {op: 'query'}));
	}

	this.all = function(fnc, opt){
		return this.find([], fnc, opt);
	}

	this.count = function(filters, fnc, opt){
		if (!opt) opt = {};

		var use_local = this.local && botoweb.ldb.dbh && !opt.no_ldb;

		$(botoweb).triggerHandler('log', [{
			method: 'HEAD',
			op: 'count',
			model: this.name,
			filters: filters,
			local: use_local
		}]);

		if (use_local) {
			var tbl = botoweb.ldb.tables[this.name];
			var query = new botoweb.sql.Query(tbl.c.id);

			query.apply_bw_filters(filters, tbl);

			botoweb.ldb.dbh.transaction(function (txn) {
				query.count(txn, fnc);
			});

			return;
		}

		return botoweb.count(botoweb.env.base_url + this.href, filters, fnc);
	};

	this.cache = function(obj) {
		return obj;
	}

	this.instance = function (data, id) {
		botoweb.Object.call(this, (id || botoweb.util.uuid()), self, data);
		this.unsaved = true;
	};

	this.get = function(id, fnc, opt){
		opt = opt || {};

		if (this.objs[id])
			return fnc(this.objs[id], false);

		var use_local = this.local && botoweb.ldb.dbh && !opt.no_ldb;

		$(botoweb).triggerHandler('log', [{
			method: 'GET',
			op: 'get_by_id',
			model: this.name,
			id: id,
			local: use_local
		}]);

		if (use_local) {
			opt.one = true;
			opt.not_found = function () {
				botoweb.get_by_id(botoweb.util.url_join(botoweb.env.base_url, self.href), id, fnc, opt);
			};
			return this.query_ldb({id: id}, fnc, opt);
		}

		botoweb.get_by_id(botoweb.util.url_join(botoweb.env.base_url, this.href), id, fnc, opt);
	}

	this.save = function(data, fnc){
		var id = '';

		ref = botoweb.env.base_url + this.href;
		method = "POST";
		if("id" in data && typeof data.id != 'undefined'){
			id = data.id;

			ref += ("/" + data.id);
			delete data.id;
			method = "PUT";
		}

		$(botoweb).triggerHandler('log', [{
			method: method,
			op: 'save',
			model: this.name,
			id: id,
			data: data,
			local: false
		}]);

		return botoweb.save(ref, this.name, data, method, fnc);
	}

	//
	// Delete this object
	//
	this.del = function(id, fnc){
		$(botoweb).triggerHandler('log', [{
			method: 'DELETE',
			op: 'del',
			model: this.name,
			id: id,
			local: false
		}]);

		return botoweb.del(botoweb.util.url_join(botoweb.env.base_url, this.href, id), function(success) {
			if (success) {
				delete self.objs[id];

				if (self.local) {
					botoweb.ldb.sync.process([new self.instance(null, id)], null, null, function () {
						if (fnc)
							fnc(success);
					}, { trash: true });
				}
				// Non-local data will not update immediately. 1 second is an
				// arbitrary wait time but seems to be long enough that the
				// backreference in SDB will have updated by the time we run the fnc
				else if (fnc) {
					setTimeout(function () {
						fnc(success);
					}, 1000);
				}
			}

			if (fnc)
				fnc(success);
		});
	}

	this.toString = function () {
		return this.name;
	}

};
