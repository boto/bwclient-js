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
		var tbl = botoweb.ldb.tables[this.name];
		var query = new botoweb.sql.Query(tbl);

		query.apply_bw_filters(filters, tbl);

		function do_query (txn) {
			var total_results = 0;
			var page = 0;

			function next_page() {
				botoweb.ldb.dbh.transaction(function (txn) {
					query.page(txn, function(results, page) {
						return fnc($.map(results, function (row) { return row[0]; }), page, total_results, next_page);
					}, page++);
				});
			};

			query.count(txn, function (count) {
				total_results = count;
				next_page();
			});
		}

		if (opt.txn)
			do_query(opt.txn);
		else {
			botoweb.ldb.dbh.transaction(function (txn) {
				do_query(txn);
			});
		}
	};

	this.find = function(filters, fnc, opt){
		if (!opt) opt = {};

		if (this.local && botoweb.ldb.dbh && !opt.no_ldb) {
			return this.query_ldb(filters, fnc, opt);
		}

		botoweb[(opt.query) ? 'query' : 'find'](botoweb.env.base_url + this.href, filters, botoweb.env.model_names.join(','), fnc);
	}

	this.query = function(query, fnc, opt) {
		return this.find(query, fnc, $.extend(opt, {query: 1}));
	}

	this.all = function(fnc, opt){
		return this.find([], fnc, opt);
	}

	this.count = function(query, fnc){
		botoweb.count(botoweb.env.base_url + this.href, query, function(count) {
			fnc(count);
		});
	}

	this.cache = function(obj) {
		return obj;
	}


	this.get = function(id, fnc, opt){
		if (!opt) opt = {};

		if (this.objs[id])
			return this.objs[id];

		if (this.local && botoweb.ldb.dbh && !opt.no_ldb) {
			return this.query_ldb({id: id}, fnc, opt);
		}

		botoweb.get_by_id(botoweb.util.url_join(botoweb.env.base_url, this.href), id, function(obj) {
			return fnc(obj);
		});
	}

	this.save = function(data, fnc){
		ref = botoweb.env.base_url + this.href;
		method = "POST";
		if("id" in data && typeof data.id != 'undefined'){
			delete self._cache[data.id];
			ref += ("/" + data.id);
			delete(data['id']);
			method = "PUT";
		}
		delete self._cache[data.id];
		return botoweb.save(ref, this.name, data, method, fnc);
	}

	//
	// Delete this object
	//
	this.del = function(id, fnc){
		ref = this.href;
		return botoweb.del(botoweb.env.base_url + ref + "/" + id, function(x) {
			/*$(self.data_tables[id]).each(function() {
				this.table.del(this.row);
			});*/
			delete self.data_tables[id];
			delete self._cache[id];
			return fnc(x);
		});
	}

};
