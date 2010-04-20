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
		condition: function (block) {
			var matches = false;

			$markup.find(block.node, 'condition', function (val, prop) {
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
					no_cache: block.no_cache
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
							function update () {
								if (block.opt.onsave)
									block.opt.onsave();
								else
									botoweb.ui.page.refresh();
							}

							if ($($forms).triggerHandler('save_complete', [obj, update]) !== false)
								update();
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

					var editable = this.parents($markup.sel.editable + ':first').attr($markup.prop.editable);

					if (editable === undefined)
						editable = block.opt.editable;

					editable = (editable == 'false' || editable === false) ? false : true;

					var node = this;
					var contents;
					var prop = block.model.prop_map[val];

					if (prop.is_type('reference', 'query')) {
						if (follow_props) {
							this.append($('<span/>')
								.attr(prop, follow_props));
						}

						if (this.find($markup.sel.attribute + ', ' + $markup.sel.attribute_list).length == 0) {
							this.append('<a bwAttribute="name" bwLink="view"/>');
						}

						contents = this.contents().clone();
						this.empty();

						function descend (obj) {
							if (obj && obj.id) {
								var b = new botoweb.ui.markup.Block($('<div/>').append(contents.clone()), {
									obj: obj,
									editable: editable,
									parent: block,
									no_cache: block.no_cache
								});
								block.children.push(b);

								node.append(b.node.contents());
							}
						}

						if (block.obj) {
							block.waiting++;

							var async = false;

							block.obj.data[val].val(function (data) {
								$.each(data, function () {
									if (this && this.val)
										descend(this.val);
								});

								block.waiting--;

								if (async && !block.waiting)
									block.done();
							}, $.extend({ obj: block.obj }, block.opt));

							async = true;
						}
						else {
							descend();
						}
					}

					else if (prop.is_type('list')) {
						if (block.obj) {
							block.waiting++;
							var async = false;

							node.hide();

							block.obj.data[val].val(function (data) {
								if (data.length && (data.length > 1 || data[0].val)) {
									if (node.is('li')) {
										var items = block.obj.data[val].toString(true);
										$.each(items, function () {
											node.after(node.clone().html('' + this).show());
										});
									}
									else {
										var str = block.obj.data[val].toString();

										if (str)
											node.html(str);

										node.show();
									}
								}

								block.waiting--;

								if (async && !block.waiting)
									block.done();
							}, block.opt);

							async = true;
						}
					}

					else if (block.obj && prop.is_type('blob')) {
						block.obj.load(val, function (data) {
							if (!data) return;

							node.html(botoweb.util.html_format(data));
						});
					}

					else if (block.obj) {
						this.html(block.obj.data[val].toString() || '');
					}

					if (editable && prop.meta.write) {
						var opt = {
							node: this,
							block: block,
							model: block.model,
							editable: false,
							def: block.def[prop.meta.name]
						};


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

			if (!block.model && !block.obj)
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
					this.click(function () {
						block.model.get(block.obj_id, function (obj) {
							var dialog = $('<div/>')
								.html(
									'Are you sure you want to delete the following ' + block.model.name + '?'
									+ '<h3>' + obj.toString() + '</h3>'
								)
								.dialog({
									resizable: true,
									modal: true,
									title: 'Please confirm',
									buttons: {
										'Delete item': function() {
											var dialog = $(this);
											botoweb.ui.overlay.show();

											obj.del(function () {
												var recent_page = '';
												var steps = 0;
												$.each(botoweb.ui.page.history, function () {
													if (this.data.id != block.obj_id) {
														recent_page = this;
														return false;
													}
													steps++;
												});

												botoweb.ui.overlay.hide();

												dialog.dialog('close')

												if (steps == 0)
													botoweb.ui.page.refresh(true);
												else if (recent_page.full)
													document.location.href = recent_page.full;
												else
													history.back();

												setTimeout(botoweb.ldb.sync.update, 1000);
											});
											return false;
										},
										'Cancel': function() {
											$(this).dialog('close');
										}
									}
								});

							dialog.parent('.ui-dialog').find('button:last').addClass('ui-priority-secondary');
						});
					});

					return;
				}

				// Without an object, the only supported link type is create
				if (val != 'create' && !block.obj)
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

				if (block.obj)
					view_href = '#' + botoweb.util.interpolate(botoweb.env.cfg.templates.model, block.model) + '?id=' + escape(block.obj.id);

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
									}, true);
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
								set_href(botoweb.util.url_join(botoweb.env.cfg.base_url, block.model.href, block.obj.id, data));
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

				var results = new botoweb.ui.widget.SearchResults(this, block.model);

				block.obj.follow(val, results.update, null, { no_cache: true });
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

				new botoweb.ui.widget.Search(this);
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
