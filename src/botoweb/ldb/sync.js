/**
 * Manages synchronization between the local and remote databases.
 *
 * @author Ian Paterson
 */
botoweb.ldb.sync = {
	/**
	 * The total number of records which have been updated so far.
	 */
	task_processed: 0,
	/**
	 * The total number of records which are set to update.
	 */
	task_total: 0,
	running: false,

	/**
	 * Updates the local database by querying a model for recently updated
	 * records. When called with no arguments, updates all models in the
	 * environment. Records are updated if they exist or inserted if they do not.
	 * Unless the all parameter is true, updates anything which has changed
	 * since the last_update localStorage key and also updates that key.
	 *
	 * @param {botoweb.ModelMeta} model The model to query.
	 * @param {Boolean} all If true, fetches all records regardless of update
	 * timestamps.
	 */
	update: function(model, all) {
		var self = botoweb.ldb.sync;

		if (self.running)
			return;

		if (!model)
			return;

		self.running = true;

		self.task_processed = 0;
		self.task_total = 0;

		if (!all && localStorage.last_update) {
			model.query([['modified_at', '>', localStorage.last_update]], self.process, { no_ldb: true });
		}
		else {
			model.all(self.process, { no_ldb: true });
		}

		var d = self.last_update = new Date();
		var timestamp = [d.getUTCFullYear(),'0' + (d.getUTCMonth()+1),'0' + d.getUTCDate()].join('-') +
			'T' + ['0' + d.getUTCHours(),'0' + d.getUTCMinutes(),'0' + d.getUTCSeconds()].join(':');
		timestamp = timestamp.replace(/([:T-])0(\d\d)/g, '$1$2');

		localStorage.setItem('last_update', timestamp);
	},

	/**
	 * Drops all tables in the database, creates a fresh schema, then does a
	 * full CoreModel update. Use with caution, this will take a long time to
	 * run!
	 */
	reset: function() {
		var db = botoweb.ldb.dbh;
		$.each(botoweb.ldb.tables, function(i, table) {
			db.transaction(function (txn) {
				table.__drop(txn);
			});
		});

		localStorage.setItem('last_update', '');
		botoweb.ldb.prepare(function() {
			botoweb.ldb.sync.update();
		}, function() {});
	},

	/**
	 * Processes sync results by updating or inserting corresponding records in
	 * the local database. List and complexType properties are handled by
	 * deleting all records corresponding to the object in the list or mapping
	 * table and then inserting anything in the object properties, to ensure
	 * that old data is not retained.
	 *
	 * This method triggers several events on botoweb.ldb.sync and the UI may
	 * bind listening functions to those events. The events are "begin" when
	 * the first page of results loads, "change" when each page of results is
	 * finished (useful for a progress bar), and "end" when all results have
	 * been loaded.
	 *
	 * @param {[botoweb.Model]} results The objects to be inserted.
	 * @param {Integer} page The current results page.
	 * @param {Integer} total_count The total results count.
	 */
	process: function (results, page, total_count) {
		var self = botoweb.ldb.sync;

		if (page == 0) {
			self.task_total += 1 * total_count;

			// The UI code can establish a listener for the begin event
			$(self).trigger('begin', [{
				num_updates: self.task_total
			}]);
		}

		$.each(results, function(i, obj) {
			var db = botoweb.ldb.dbh;
			var bind_params = [obj.id];
			var model = botoweb.env.models[obj.model];
			var column_names = [];

			// Find all the bound parameters in the order specified in the table
			$.each(model.properties, function() {
				var model_prop = this;
				var prop = obj.properties[this.name];

				if (this._type == 'query')
					return;
				else if (this._type == 'list' || this._type == 'complexType') {
					db.transaction(function (txn) {
						txn.executeSql(
							'DELETE FROM ' + botoweb.ldb.prop_to_table(model, model_prop) +
							' WHERE id = ?',
							[obj.id]
						);
					}, function(e) { alert(e.message) });

					if (!prop)
						return;

					var v = prop;

					if (v.value)
						v = v.value;
					if (!$.isArray(v))
						v = [v];

					$.each(v, function() {
						var bp = [obj.id, (this.value || this)];
						var values = '(?,?)';

						if (model_prop._type == 'complexType') {
							bp = [obj.id, this.name, this.value];
							values = '(?,?,?)';
						}

						db.transaction(function (txn) {
							txn.executeSql(
								'INSERT INTO ' + botoweb.ldb.prop_to_table(model, model_prop) +
								' VALUES ' + values,
								bp
							);
						}, function(e) { alert(e.message) });
					});
				}
				else {
					column_names.push(botoweb.ldb.prop_to_column(this));

					if (prop)
						bind_params.push(prop.id || prop);
					else
						bind_params.push(null);
				}
			});

			db.transaction(function (txn) {
				txn.executeSql(
					'REPLACE INTO ' + botoweb.ldb.model_to_table(model) +
					' VALUES (' + $.map(bind_params, function() { return '?' }).join(', ') + ')',
					bind_params
				);
			}, function(e) { alert(e.message); });
		});

		self.task_processed += results.length;

		// The UI code can establish a listener for the change event
		$(self).trigger('change', [{
			percent_complete: Math.round(100 * self.task_processed / self.task_total)
		}]);

		// The UI code can establish a listener for the load event
		if (self.task_processed >= self.task_total) {
			self.running = false;

			$(self).trigger('end', [{
				num_updates: self.task_total,
				num_updated: self.task_processed,
				last_update: localStorage.last_update
			}]);
		}

		// Signals botoweb to fetch more pages
		return true;
	}
};