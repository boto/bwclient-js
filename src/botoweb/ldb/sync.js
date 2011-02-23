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
	update_queue: [],
	refresh_queue: [],
	first_sync: true,

	/**
	 * Updates the local database by querying a model for recently updated
	 * records. When called with no arguments, updates all models in the
	 * environment config db.sync_models array. Records are updated if they
	 * exist or inserted if they do not. Unless the all parameter is true,
	 * updates anything which has changed since the last_update localStorage key
	 * and also updates that key.
	 *
	 * @param {[botoweb.Model]} models The model to query.
	 * @param {Boolean} refresh If true, fetches all records regardless of
	 * update timestamps.
	 */
	update: function(models, opt) {
		if (!botoweb.ldb.dbh)
			return $(this).trigger('end');

		opt = opt || {};
		var self = botoweb.ldb.sync;

		var now = new Date().valueOf();

		// Only allow one tab to sync
		if (localStorage.sync_app && localStorage.sync_app != botoweb.uuid && localStorage.sync_app_timeout > now) {
			console.log('Another tab is synchronizing.');
			return;
		}

		// Take control of the sync_app lock
		localStorage.setItem('sync_app', botoweb.uuid);
		localStorage.setItem('sync_app_timeout', now + 8 * 1000);

		if (self.running)
			return;

		// sync_model is set when a model is being synced. If the page is
		// refreshed while the update is running, this ensures that the sync
		// continues right away
		if (localStorage.sync_model) {
			self.update_queue.push(botoweb.env.models[localStorage.sync_model]);
		}

		self.find_local_models();

		if (!models)
			models = botoweb.env.cfg.db.sync_models;

		if (!$.isArray(models))
			models = [models];

		$.each(models, function() {
			if (opt.refresh)
				self.refresh_queue.push(this);
			else
				self.update_queue.push(this);
		});

		self.next_update();
	},

	/**
	 * Allows a single tab to lock sync priveleges. Called at a short interval
	 * to update the heartbeat data, this function will also trigger a sync as
	 * soon as another tab loses control to ensure that any partial syncs are
	 * completed.
	 */
	heartbeat: function () {
		var now = new Date().valueOf();

		// Update my timeout
		if (localStorage.sync_app == botoweb.uuid) {
			localStorage.setItem('sync_app_timeout', now + 8 * 1000);
		}
		// Take control
		else if (localStorage.sync_app && localStorage.sync_app != botoweb.uuid && localStorage.sync_app_timeout <= now) {
			botoweb.ldb.sync.update();
			botoweb.ldb.sync.verify();
		}
	},

	/**
	 * Checks the record count in the local database against the object count in
	 * SimpleDB. Since SimpleDB counts are not 100% accurate, allows for a 10%
	 * variance. If the local data appears to be tampered with the corresponding
	 * tables are reset.
	 */
	verify: function () {
		// Only allow synching tab to verify data
		if (localStorage.sync_app && localStorage.sync_app != botoweb.uuid && localStorage.sync_app_timeout > new Date().valueOf())
			return;

		$.each(botoweb.env.models, function(i, model) {
			// This also takes care of the obvious problem if we tried to verify
			// counts while a model was synchronizing. Synchronizing models are
			// marked as not local. On page load, botoweb.ldb.sync.update MUST
			// be called before verify.
			if (!model.local)
				return;

			var num_remote = -1;
			var num_local = -1;

			// Run both counts at the same time, asynchronously, then call this
			// function when both have finished.
			var compare_counts = function (local, remote) {
				if (remote < local * .9 || remote > local * 1.1) {
					console.warn(model.name + ' may be corrupted, will be repaired. Found ' + remote + ' remote and ' + local + ' local records.');

					// Drop tables and mark model for re-synching.
					botoweb.ldb.sync.reset(model.name);
				}
			};

			// Count objects in Simple DB (count may be estimated)
			model.count([], function (remote) {
				if (num_local >= 0)
					compare_counts(num_local, remote);
				else
					num_remote = remote;
			}, { no_ldb: true });

			// Count exact number of records in local DB
			model.count([], function (local) {
				if (num_remote >= 0)
					compare_counts(local, num_remote);
				else
					num_local = local;
			});
		});
	},

	/**
	 * Inspects the update and refresh queues to choose the next update to run.
	 * The refresh queue contains jobs which explicitly ask for all results, so
	 * these generally take longer and will be run when the update queue is
	 * empty.
	 */
	next_update: function() {
		var self = botoweb.ldb.sync;
		var model;
		var refresh = false;

		// Choose from the update queue first (these are generally faster jobs)
		if (self.update_queue.length)
			model = self.update_queue.shift();
		else if (self.refresh_queue.length) {
			model = self.refresh_queue.shift();
			refresh = true;
		}

		// All updates complete
		else {
			self.find_local_models();

			// The UI code can establish a listener for the end event
			self.running = false;

			delete localStorage.sync_app;
			delete localStorage.sync_app_timeout;

			$(self).trigger('end');

			return;
		}

		var model_name = model;

		if (!self.running)
			self.running = true;

		if (!model.name)
			model = botoweb.env.models[model];

		if (!model || !model.name) {
			console.warn('Cannot sync unknown model: ' + model_name);
			return botoweb.ldb.sync.next_update();
		}

		// Clear the table for a full refresh to ensure that deleted items are
		// deleted locally as well.
		if (refresh) {
			botoweb.ldb.dbh.transaction(function (txn) {
				botoweb.ldb.tables[model.name].__empty(txn);
			}, function () { });
		}

		self.task_processed = 0;
		self.task_total = 0;
		self.update_model = model;

		// Next time, find any updates within 60 seconds of the current time
		// just in case we missed something new this time. In case the client's
		// time is considerably different than the server time, we add the
		// time_delta which is calculated when the API is loaded.
		var recent_date = new Date(new Date().valueOf() - 60000 + botoweb.env.cfg.time_delta);

		var timestamp = botoweb.util.timestamp(recent_date);

		var options = {
			no_ldb: true,
			no_cache: true,
			refresh: refresh
		};
		var processor = self.process;

		if (self.update_model.name == 'Trash') {
			options.minimal_parse = true;
			processor = self.process_trash;
		}

		console.log("=====> " + model.name + " <=====");
		console.log("Refresh: " + refresh);

		if (refresh) {
			if ('sys_modstamp' in model.prop_map)
				model.find({sort_by: 'sys_modstamp'}, processor, options);
			else
				model.all(processor, options);
		}

		// Some models are not local because they do not store any data (i.e.
		// a Trash object or a base class from which other objects canbe queried)
		else if (!model.has_local_data) {
			if (localStorage['last_update_' + model.name]) {
				console.log("last_update: " + localStorage['last_update_' + model.name]);

				model.query([['sys_modstamp', '>=', localStorage['last_update_' + model.name]], ['sys_modstamp', 'sort', 'asc']], processor, options);
			} else {
				if ('sys_modstamp' in model.prop_map)
					model.find({sort_by: 'sys_modstamp'}, processor, options);
				else
					model.all(processor, options);
			}
		}

		// The localStorage is unreliable for some reason, this checks the
		// actual data for the most recently updated item rather than the most
		// recent update.
		else {
			botoweb.ldb.dbh.transaction(function (txn) {
				txn.executeSql(
					'SELECT MAX(prop_sys_modstamp) AS last_update FROM ' + botoweb.ldb.model_to_table(model),
					[],
					function (txn, results) {
						if (results.rows.length && results.rows.item(0).last_update) {
							var last_update = results.rows.item(0).last_update;
							console.log("last_update: " + last_update);

							model.query([['sys_modstamp', '>=', last_update], ['sys_modstamp', 'sort', 'asc']], processor, options);
						}
						else
							model.find({sort_by: 'sys_modstamp'}, processor, options);
					},
					function () {
						model.find({sort_by: 'sys_modstamp'}, processor, options);
					}
				);
			});
		}

		// Although we may fetch multiple pages of results, these results are a
		// snapshot of the current state, so the update time is now, not when
		// the query ends.
		localStorage.setItem('last_update_' + model.name, timestamp);
	},

	/**
	 * Tries to select a single result from every model table. If the result is
	 * not empty, updates the model to specify that it is stored locally. A
	 * callback can be provided to ensure that all tables are tested before
	 * moving on.
	 */
	find_local_models: function (fnc) {
		botoweb.ldb.dbh.transaction(function (txn) {
			var completed = 0;
			var total = 0;

			$.each(botoweb.env.models, function (i, model) {
				total++;
				txn.executeSql('SELECT 1 FROM ' + botoweb.ldb.model_to_table(model) + ' LIMIT 1', [], function (txn, results) {
					completed++;

					// The table is local if it has results, as long as it is
					// not currently synchronizing - that means it is an
					// incomplete portion of the results.
					if (results.rows.length) {
						// Model is not truly local if it is still syncing.
						if (model.name != localStorage.sync_model)
							model.local = true;

						// But we still need to know if it had local data
						model.has_local_data = true;
					}

					if (fnc && completed == total)
						fnc();
				}, function () {
					completed++;

					model.local = false;

					if (fnc && completed == total)
						fnc();
				})
			});
		});
	},

	/**
	 * Drops all tables in the database, creates a fresh schema, then does a
	 * full update. Use with caution, this will take a long time to run! If the
	 * optional model_name is provided, resets only that model.
	 */
	reset: function(model_name) {
		var db = botoweb.ldb.dbh;

		if (model_name) {
			var model = botoweb.env.models[model_name];
			model.local = false;

			db.transaction(function (txn) {
				botoweb.ldb.tables[model_name].__drop(txn);

				// Drop any tables for this model's properties
				$.each(model.props, function () {
					if (this.is_type('list', 'complexType')) {
						botoweb.ldb.tables[botoweb.ldb.prop_to_table(this)].__drop(txn);
					}
				});
			});

			localStorage.setItem('last_update_' + model_name, '');
		}
		else {
			$.each(botoweb.ldb.tables, function(i, table) {
				table.model.local = false;
				db.transaction(function (txn) {
					table.__drop(txn);
				});
			});

			for (var key in localStorage) {
				if (key.indexOf('last_update') == 0)
					localStorage.setItem(key, '');
			}
		}

		self.first_sync = false;

		botoweb.ldb.prepare(function() {
			botoweb.ldb.sync.update();
		}, function (e) {
			console.error(e);
		});
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
	 * @param {[botoweb.Object]} results The objects to be inserted.
	 * @param {Integer} page The current results page.
	 * @param {Integer} total_count The total results count.
	 */
	process: function (results, page, total_count, next_page, opt) {
		opt = opt || {};
		var self = botoweb.ldb.sync;

		if (page == 0) {
			self.task_total += 1 * total_count;

			// The UI code can establish a listener for the begin event
			if (self.task_total) {
				$(self).trigger('begin', [{
					num_updates: self.task_total,
					model: self.update_model,
					refresh: opt.refresh
				}]);
			}
		}

		var result_id = self.task_processed;

		// Just used a lot of CPU to parse the XML, pause for a short time
		// before Local DB processing to allow foreground processing.
		setTimeout(function () {
			if (results.length && self.update_model) {
				localStorage.setItem('sync_model', self.update_model.name);
			}

			botoweb.ldb.dbh.transaction(function (txn) {
				$.each(results, function(i, obj) {
					var db = botoweb.ldb.dbh;
					var bind_params = [obj.id];
					var model = obj.model;
					var column_names = [];

					// Update any cached versions of this object
					if (obj.id in model.objs) {
						if (opt.trash)
							delete model.objs[obj.id];
						else
							model.objs[obj.id] = obj;

						delete model.dummy_objs[obj.id];
					}

					result_id++;

					// Find all the bound parameters in the order specified in the table
					$.each(model.props, function() {
						var model_prop = this;
						var prop = obj.data[this.meta.name];

						// Some types cannot or should not be stored
						if (this.meta.no_store || this.is_type('query', 'blob'))
							return;
						else if (this.is_type('list', 'complexType')) {
							txn.executeSql(
								'DELETE FROM ' + botoweb.ldb.prop_to_table(model_prop) +
								' WHERE id = ?',
								[obj.id],
								null,
								function (txn, e) {
									console.error(e);
								}
							);

							if (opt.trash || !prop)
								return;

							var v = prop.val();

							bind_params.push(v.length);

							$.each(v, function() {
								var bp = [obj.id, this.val];
								var values = '(?,?)';

								if (model_prop.is_type('complexType')) {
									bp = [obj.id, this.key, this.val];
									values = '(?,?,?)';
								}
								else if (model_prop.is_type('reference')) {
									bp = [obj.id, this.id, this.type];
									values = '(?,?,?)';
								}

								txn.executeSql(
									'INSERT INTO ' + botoweb.ldb.prop_to_table(model_prop) +
									' VALUES ' + values,
									bp,
									null,
									function (e) {
										console.error(e);
									}
								);
							});
						}
						else if (!opt.trash && this.is_type('reference')) {
							column_names.push(botoweb.ldb.prop_to_column(this));
							column_names.push(botoweb.ldb.prop_to_column(this) + '__type');

							if (prop) {
								var v = prop.val()[0];
								bind_params.push(v.id);
								bind_params.push(v.type);
							}
							else {
								bind_params.push(null);
								bind_params.push(null);
							}
						}
						else {
							column_names.push(botoweb.ldb.prop_to_column(this));

							if (prop)
								bind_params.push(prop.to_sql());
							else
								bind_params.push(null);
						}
					});

					var rid = result_id + 0;

					if (opt.trash) {
						txn.executeSql( 'DELETE FROM ' + botoweb.ldb.model_to_table(model) +
							' WHERE id = ?',
							[obj.id],
							function () {
								if (rid % 50 == 0) {
									// The UI code can establish a listener for the change event
									$(self).trigger('change', [{
										percent_updated: (self.task_total) ? Math.round(10000 * rid / self.task_total) / 100 : 100,
										percent_downloaded: (self.task_total) ? Math.round(10000 * self.task_processed / self.task_total) / 100 : 100
									}]);
								}
							},
							function (txn, e) {
								console.error(e);
							}
						);
						txn.executeSql( 'DELETE FROM meta_cache_props' +
							' WHERE id = ?',
							[obj.id]
						);
					}
					else {
						txn.executeSql( "INSERT OR REPLACE INTO " +
							botoweb.ldb.model_to_table(model) +
							' VALUES (' + $.map(bind_params, function() { return '?' }).join(', ') + ')',
							bind_params,
							function () {
								if (rid % 50 == 0) {
									// The UI code can establish a listener for the change event
									$(self).trigger('change', [{
										percent_updated: (self.task_total) ? Math.round(10000 * rid / self.task_total) / 100 : 100,
										percent_downloaded: (self.task_total) ? Math.round(10000 * self.task_processed / self.task_total) / 100 : 100
									}]);
								}
							},
							function (txn, e) {
								console.error(e);
							}
						);
					}
				});

				// This method may be called without task data to update
				// specific records. If so, we don't want to change any counts
				// for the current sync.
				if (total_count){
					self.task_processed += results.length;
					//DEBUG console.log("Processed: " + self.task_processed);
				}

				// The following lines use setTimeout to call the function. This
				// allows the call stack to be cleared to prevent a rather bad
				// memory leak from every page of results piling up in memory. It
				// also provides a break for foreground processing.

				// When we finish, grab the next page of results
				if (next_page) {
					setTimeout(next_page, 250);
				}
				// Otherwise run the next queued update
				else{
					// Delete key to avoid running the update again on refresh
					delete localStorage.sync_model;

					setTimeout(self.next_update, 500);
				}
			});
		}, 250);

		// DB transaction is asynchronous, so we return false to prevent loading
		// the next page of results right away
		return false;
	},

	/**
	 * Calls process with a trash argument which causes results to be deleted
	 * from local DB.
	 */
	process_trash: function (results, page, total_count, next_page) {
		return botoweb.ldb.sync.process(results, page, total_count, next_page, { trash: 1 });
	}
};
