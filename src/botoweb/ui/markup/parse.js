/**
 * A library of botoweb markup parsers
 *
 * @author Ian Paterson
 */

(function ($) {
	botoweb.ui.markup.parse = {
		/**
		 * Parse conditional tags and remove them from the block.node if the
		 * corresponding condition function returns false.
		 */
		condition: function (block, pre_condition) {
			var matches = false;

			var sel = 'condition';

			if (pre_condition)
				sel = 'pre_condition';

			$markup.find(block.node, sel, function (val, prop) {
				matches = true;

				this.removeAttr(prop);

				if (val in botoweb.env.cfg.conditions){
					if(botoweb.env.cfg.conditions[val](block.obj, this) === false)
						this.remove();
				}
				else
					console.error('UI condition does not exist: ' + val);
			});

			return matches;
		},

		/**
		 * Calls condition but directs it to search for precondition blocks.
		 */
		pre_condition: function (block) {
			return $markup.parse.condition(block, true);
		},

		/**
		 * Parse triggers and execute them.
		 */
		trigger: function (block) {
			var matches = false;

			$markup.find(block.node, 'trigger', function (val, prop) {
				matches = true;

				if (val in botoweb.env.cfg.triggers)
					botoweb.env.cfg.triggers[val](block.obj, this);
				else
					this.removeAttr(prop);
			});

			return matches;
		},

		/**
		 * Remove content which the user is not allowed to view
		 */
		auth: function (block) {
			var matches = false;

			$markup.find(block.node, 'auth', function (val, prop) {
				matches = true;
				var authorized = true;
				var node = $(this);

				if (node.hasClass('deny-all')) {
					authorized = false;
					$(botoweb.env.user.data.auth_groups.toString(true)).each(function() {
						if (node.hasClass('allow-' + this))
							authorized = true;
					});
				}
				else {
					$(botoweb.env.user.data.auth_groups.toString(true)).each(function() {
						if (node.hasClass('deny-' + this))
							authorized = false;
					});
				}

				if (!authorized)
					node.remove();
				else
					node.removeClass('auth');
			});

			return matches;
		},

		/**
		 * Parses forms which are enhanced with botoweb markup.
		 */
		action: function (block) {
			var matches = false;

			$markup.find(block.node, 'action', function(val, prop) {
				matches = true;

				var model = this.attr($markup.prop.model);

				if (model)
					model = botoweb.env.models[model];

				if (!model) {
					this.remove();
					return;
				}

				// Additional data may be included in parens after the link type
				/()/.test(''); // reset RegExp backrefs
				val = val.replace(/\((.*?)\)/, '');
				var data = RegExp.$1;

				if (block.opt.data)
					data = $util.interpolate(data, block.opt.data);
				else if (block.obj)
					data = $util.interpolate(data, block.obj);
				else if (block.model)
					data = $util.interpolate(data, block.model);
				else
					data = $util.interpolate(data);

				this.removeAttr(prop);

				var b = new $markup.Block(this, {
					model: model,
					editable: true,
					no_cache: block.no_cache,
					root: block.opt.redirect_on_save
				});

				if (data) {
					try {
						eval('data = ' + data);

						for (var prop in data) {
							var field = $forms.prop_field(new model.prop_map[prop].instance(), {
								block: b,
								def: data[prop]
							});
							b.fields.push(field);
						}
					} catch (e) { }
				}

				$(b).trigger('edit');

				$('<br class="clear"/>').appendTo(this);

				botoweb.ui.button('Create ' + model.name, { icon: 'ui-icon-disk' })
					.click(function (e) {
						e.preventDefault();

						b.save(function (obj) {
							if (block.opt.onsave)
								block.opt.onsave();
							else
								botoweb.ui.page.refresh();

							return false;
						});

						return false;
					})
					.appendTo(this);

				botoweb.ui.button('Reset', { icon: 'ui-icon-arrowrefresh-1-e', primary: false })
					.click(function (e) {
						$(b).trigger('edit');

						e.preventDefault();

						return false;
					})
					.appendTo(this);
			});

			return matches;
		},

		/**
		 * Parse attributes.
		 */
		attribute: function (block) {
			var matches = false;

			if (!block.model && !block.obj)
				return;

			var still_matches;

			do {
				still_matches = false;

				$markup.find(block.node, 'attribute', function(val, prop) {
					still_matches = matches = true;

					var follow_props = val.split('.');
					val = follow_props.shift();
					follow_props = follow_props.join('.');

					this.removeAttr(prop);
					this.attr('_' + prop, val);

					// Special cases
					if (val == 'id')
						return this.html(block.obj.id);
					else if (val == 'model')
						return this.html(block.obj.model.name);

					// If the property is not supported, empty the container to
					// prevent anything inside from being parsed according to
					// the current object when it was intended for a referenced
					// object
					if (!(val in block.model.prop_map) || !block.model.prop_map[val].meta.read) {
						this.empty();
						return;
					}

					var editable = this.attr($markup.prop.editable) || this.parents($markup.sel.editable + ':first').attr($markup.prop.editable);

					if (editable === undefined)
						editable = block.opt.editable;

					editable = (editable == 'false' || editable === false) ? false : true;

					var node = this;
					var contents;
					var prop = block.model.prop_map[val];

					var display_prop = function (prop) {
						if (prop.is_type('reference', 'query')) {
							if (follow_props) {
								node.append($('<span/>')
									.attr(prop, follow_props));
							}

							if (node.find($markup.sel.attribute + ', ' + $markup.sel.attribute_list).length == 0) {
								node.append('<a bwAttribute="name" bwLink="view"/>');
							}

							contents = node.contents().clone();
							node.empty();

							function descend (obj) {
								if (obj && obj.id) {
									var b = new botoweb.ui.markup.Block($('<div/>').append(contents.clone()), {
										obj: obj,
										editable: editable,
										//parent: block,
										no_cache: block.no_cache
									});
									//block.children.push(b);

									node.append(b.node.contents());
								}
							}

							if (block.obj) {
								block.waiting++;

								var load_data = function () {
									var async = false;

									node.unbind('ready');

									var filter = node.attr($markup.prop.filter);

									if (filter) {
										try {
											filter = $util.interpolate(filter, block.obj);
											eval('filter = ' + filter);
										}
										catch (e) { console.error(e.message) }
									}

									botoweb.Object.val(block.model, (block.obj || block.obj_id), val, function (data) {
										$.each(data, function () {
											if (this && this.val)
												descend(this.val);
										});

										block.waiting--;

										data = null;

										if (async && !block.waiting) {
											block.done();
											block = null;
											prop = null;
										}
									}, $.extend({
										obj: block.obj,
										filter: filter
									}, block.opt));

									async = true;
								}

								if (node.is('.delay_load'))
									node.bind('ready', load_data);
								else
									load_data();
							}
							else {
								descend();
							}
						}

						else if (prop.is_type('list')) {
							if (block.obj) {
								block.waiting++;
								var async = false;
								var limit = node.attr($markup.prop.limit) * 1;

								node.hide();

								prop.val(function (data) {
									var p = prop;

									// Remove anything past the limit
									if (limit && data.length > limit) {
										data = data.slice(0, limit);

										// Create a fake property for the truncated data
										p = new block.model.prop_map[val].instance(data);
									}

									if (data.length && (data.length > 1 || data[0].val)) {
										if (node.is('li')) {
											var items = p.toString(true);

											// This inserts new items under the source list item,
											// so we need to reverse the list.
											$.each(items.reverse(), function (i) {
												node.after(node.clone().html('' + this + ((i > 0) ? '<span class="hidden">; </span>' : '')).show());
											});
										}
										else {
											var str = p.toString();

											if (str)
												node.html(str);

											node.show();
										}
									}

									data = null;
									p = null;

									block.waiting--;

									if (async && !block.waiting) {
										block.done();
										prop = null;
									}
								}, block.opt);

								async = true;
							}
						}

						else if (block.obj && prop.is_type('blob')) {
							node.html(botoweb.util.html_format(prop.toString()));
						}

						// Special tabular display of mappings
						else if (block.obj && prop.is_type('complexType') && node.is('tr')) {
							// Cannot be edited in any way
							editable = false;

							var data = prop.val();
							$.each(data, function (i, item) {
								var row = node.clone().insertBefore(node);

								$markup.find(row, '_attribute', function(val, prop) {
									if (val == 'key')
										this.html(item.key);
									else if (val == 'val')
										this.html(item.val);

									this.removeAttr(prop);
								});
							});

							var table = node.parents('table.dataTable');

							if (table.length) {
								new botoweb.ui.widget.DataTable(table);
							}

							// Empty template row no longer needed
							node.remove();
						}

						else if (block.obj && prop.is_type('dateTime')) {
							var str = prop.toString();

							if (!str)
								node.html('');

							// Facilitate sorting
							else {
								if (node.attr($markup.prop.date_format))
									str = $util.from_timestamp(prop.val()[0].val, node.attr($markup.prop.date_format));

								node.html('<!-- DATA ' + prop.to_sql() + ' -->' + str);
							}
						}

						else if (block.obj) {
							node.html(prop.toString() || '');
						}

						if (editable && prop.meta.write) {
							var opt = {
								node: node,
								block: block,
								model: block.model,
								editable: false,
								input: node.attr($markup.prop.input_type)
							};

							if (prop.meta.name in block.def)
								opt.def = block.def[prop.meta.name];

							// Force value for the field
							if (prop.meta.name in block.data) {
								opt.val = [{val: block.data[prop.meta.name]}];
							}

							// Ensure the template is nested in a single parent
							contents = $('<div/>').append(contents);

							// In order to have a template, a propert must be either
							// a reference or query, and it must have at least one
							// editable attribute or attrbuteList.
							if (prop.is_type('reference','query') &&
								(contents.find($markup.sel.attribute_list).length ||
								contents.find($markup.sel.attribute).length > 1)
							) {
								opt.template = contents;
							}

							if (block.obj && val in block.obj.data)
								prop = block.obj.data[val];

							block.fields.push($forms.prop_field(prop, opt));
						}
					}

					if (block.obj) {
						// Property needs to be loaded
						if ((prop.meta.no_store || prop.is_type('blob')) && !prop.is_loaded()) {
							if (node.is('.delay_load')) {
								node.bind('ready', function () {
									block.model.get(block.obj_id, function (obj) {
										block.obj = obj;
										block.obj.load(prop.meta.name, display_prop);
									});
								});
							}
							else {
								block.waiting++;

								block.obj.load(prop.meta.name, function (p) {
									block.waiting--;

									display_prop(p);

									if (!block.waiting) {
										block.done();
										prop = null;
									}
								});
							}
						}

						// Property is either already loaded or loadable during
						// parsing
						else
							display_prop(block.obj.data[prop.meta.name]);
					}
					else {
						display_prop(prop);
					}

				}, {
					suffix: ':first'
				});
			}
			while (still_matches);

			return matches;
		},

		/**
		 * Parse nodes which are marked for hyperlinking. Links may transfer the
		 * user to a different page, open an external address, or just add a
		 * click event to the linked node. Links will be generated regardless of
		 * permissions, so the handler of the link should provide an alert when
		 * the user does not have appropriate permissions.
		 *
		 * The delete action does not have an associated link and must be
		 * handled with a click event. This is to prevent any accidental
		 * deletion by sharing links or clicking Back.
		 */
		link: function (block) {
			var matches = false;

			if (!block.model && !block.obj_id)
				return;

			$markup.find(block.node, 'link', function(val, prop) {
				matches = true;

				this.removeAttr(prop);

				// Additional data may be included in parens after the link type
				/()/.test(''); // reset RegExp backrefs
				val = val.replace(/\((.*?)\)/, '');
				var data = RegExp.$1;

				// It is safest not to make a history entry for deletes, just
				// attach a click event.
				if (val == 'delete') {
					// This link MUST be caught by a page change listener which
					// must use the browser history to get back. It will only be
					// loaded if the click event is stripped off this link.
					this.attr('href', '#?action=delete&model=' + block.model.name + '&id=' + block.obj_id);

					this.click(function (e) {
						$markup.delete_obj(block.model, block.obj_id, e);
					});

					return;
				}

				// Without an object, the only supported link type is create
				if (val != 'create' && !block.obj_id)
					return;

				var set_href;
				var node = this;

				// Use a click event on a button to simulate an anchor href
				if (this.is('button')) {
					set_href = function (href) {
						node.click(function () {
							if (href.charAt(0) == '#')
								document.location.href = botoweb.ui.page.location.href + href;
							else
								document.location.href = href;
						});
					};
				}
				else {
					set_href = function (href) {
						node.attr('href', href);
					};

					// Default href is just for show - will either be replaced or
					// overridden with a bound event.
					this.attr('href', '#' + val);
				}

				var view_href = '';

				if (block.obj_id)
					view_href = '#' + botoweb.util.interpolate(botoweb.env.cfg.templates.model, block.model) + '?id=' + escape(block.obj_id);

				if (data)
					data = $util.interpolate(data, (block.obj || block.model))

				switch (val) {
					case 'update':
					case 'edit':
						// edit with data immediately updates the object with
						// the given data
						if (data) {
							node.click(function (e) {
								try {
									eval('data = ' + data);

									for (var key in data) {
										data[key] = [{ val: data[key] }];
									}

									botoweb.ui.overlay.show();

									// Force update data (will send XML for all
									// provided data regardless of whether it
									// matches the current value or not).
									botoweb.Object.update(block.model, block.obj_id, data, function () {
										botoweb.ui.overlay.hide();
										botoweb.ui.page.refresh()
									}, { force: true });
								} catch (e) { }

								e.preventDefault();
								return false;
							});
							return;
						}

						set_href(view_href + '&action=edit');
						break;

					case 'clone':
						set_href(view_href + '&action=clone');
						break;

					case 'create':
						var model = node.attr($markup.prop.model);

						if (model)
							model = botoweb.env.models[model];

						if (!model)
							model = block.model;

						var d = '';

						// create with data sets the data as defaults in the
						// editor
						if (data) {
							d = '&data=' + escape(data);
						}

						if (model.name in botoweb.env.cfg.templates.editor)
							set_href('#' + botoweb.env.cfg.templates.editor[model.name] + '?action=edit' + d);
						else
							set_href('#' + botoweb.util.interpolate(botoweb.env.cfg.templates.model, model) + '?action=edit' + d);
						break;

					case 'attr':
						if (data in block.model.prop_map) {
							var href = block.obj.data[data].val();
							var num_choices = 0;

							if (href && href.length) {
								num_choices = href.length;
								href = href[0].val;
							}

							var text = this.text();

							// Convert emails to mailto: links
							if (href && href.indexOf('@') >= 0) {
								if (num_choices > 1 && text && text.indexOf('@') >= 0)
									href = botoweb.env.cfg.format.email_href.call(this, text, val, block.obj);
								else
									href = botoweb.env.cfg.format.email_href.call(this, href, val, block.obj);

								set_href(href);
							}

							// If the property is itself a link, ensure that it
							// includes a protocol and use it as the href
							else if (href && /(:\/\/|www\.|\.com)/.test(href)) {
								if (RegExp.$1 != '://')
									href = 'http://' + href;

								if (num_choices > 1 && text && text.indexOf('://') >= 0)
									href = botoweb.env.cfg.format.external_href.call(this, text, val, block.obj);
								else
									href = botoweb.env.cfg.format.external_href.call(this, href, val, block.obj);

								set_href(href);
							}

							// Otherwise, link to the botoweb page which will
							// display the content of the attribute
							else
								set_href(botoweb.util.url_join(botoweb.env.base_url, block.model.href, block.obj.id, data));
						}
						break;

					default:
						set_href(view_href);
						break;
				}
			});

			return matches;
		},

		/**
		 * Parse attribute lists.
		 */
		attribute_list: function (block) {
			var matches = false;

			if (!block.model && !block.obj)
				return;

			$markup.find(block.node, 'attribute_list', function(val, prop) {
				matches = true;

				this.removeAttr(prop);

				new botoweb.ui.widget.AttributeList(this, block.model, block.obj);
			}, {
				// AttributeLists nested in attributes will be processed later
				suffix: ':not(' + $markup.sel.attribute + ' ' + $markup.sel.attribute_list + ')'
			});

			return matches;
		},

		/**
		 * Parse relation blocks.
		 */
		relation: function (block) {
			var matches = false;

			if (!block.obj)
				return;

			$markup.find(block.node, 'relation', function(val, prop) {
				matches = true;

				this.removeAttr(prop);

				val = this.attr($markup.prop.attribute);

				var results = new botoweb.ui.widget.SearchResults(this, block.model, {
					// Don't let the search widget do its own query
					no_query: true
				});

				var filters = this.attr($markup.prop.filter);

				if (filters) {
					try {
						eval('filters = ' + filters);
					} catch (e) {}
				}

				var node = this;

				function load_data () {
					node.unbind('ready');
					botoweb.Object.follow(block.model, (block.obj || block.obj_id), val, results.update, filters, { no_cache: true });
				}

				if (this.is('.delay_load'))
					this.bind('ready', load_data);
				else
					load_data();
			});

			return matches;
		},

		/**
		 * Add editing tools for models and objects.
		 */
		editing_tools: function (block) {
			var matches = false;

			if (!block.model && !block.obj)
				return;

			$markup.find(block.node, 'editing_tools', function() {
				matches = true;
				new botoweb.ui.widget.EditingTools(this, block, (this.attr($markup.prop.attributes) || ''), block);
			});

			return matches;
		},

		/**
		 * Parse search blocks.
		 */
		search: function (block) {
			var matches = false;

			$markup.find(block.node, 'search', function() {
				matches = true;

				new botoweb.ui.widget.Search(this, block);
			});

			return matches;
		},

		/**
		 * Parse search result blocks.
		 */
		search_results: function (block) {
			var matches = false;

			$markup.find(block.node, 'search_results', function() {
				matches = true;
				new botoweb.ui.widget.SearchResults(this, block.model);
			});

			return matches;
		}
	};

	var $markup = botoweb.ui.markup;
	var $forms = botoweb.ui.forms;
	var $util = botoweb.util;
})(jQuery);
