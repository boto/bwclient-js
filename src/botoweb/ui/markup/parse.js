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

				if (val in botoweb.env.cfg.conditions){
					if(botoweb.env.cfg.conditions[val](block.obj, this) === false)
						this.remove();
				}
				else {
					botoweb.util.error('UI condition does not exist: ' + val);
					this.removeAttr(prop);
				}
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

					this.removeAttr(prop);

					// If the property is not supported, empty the container to
					// prevent anything inside from being parsed according to
					// the current object when it was intended for a referenced
					// object
					if (!(val in block.model.prop_map)) {
						this.empty();
						return;
					}

					var editable = this.parents($markup.sel.editable + ':first').attr($markup.prop.editable);

					if (editable === undefined)
						editable = block.opt.editable
					else
						editable = (editable == 'false') ? false : true;

					var node = this;

					if (block.model.prop_map[val].is_type('reference', 'query')) {
						var contents = this.contents().clone();
						this.empty();

						function descend (obj) {
							if (obj && obj.id) {
								var b = new botoweb.ui.markup.Block($('<div/>').append(contents.clone()), { obj: obj, editable: editable });

								node.append(b.node.contents());
							}
						}

						if (block.obj) {
							block.waiting++;

							block.obj.data[val].val(function (data, async) {
								$.each(data, function () {
									if (this && this.val)
										descend(this.val);
								});

								block.waiting--;

								if (async && !block.waiting) {
									block.done();
								}
							});
						}
						else {
							descend();
						}
					}

					else if (block.model.prop_map[val].is_type('list')) {
						if (block.obj) {
							block.waiting++;

							block.obj.data[val].val(function (data, async) {
								if (node.is('li')) {
									var items = block.obj.data[val].toString(true);
									$.each(items, function () {
										node.after(node.clone().html('' + this));
									});

									node.remove();
								}
								else {
									var str = block.obj.data[val].toString();

									if (str)
										node.html(str);
								}

								block.waiting--;

								if (async && !block.waiting) {
									block.done();
								}
							});
						}
						else {
							this.remove();
						}
					}
					else if (block.obj && block.model.prop_map[val].is_type('dateTime')) {
						new botoweb.ui.widget.DateTime(this, block.obj.data[val].toString());
					}

					else if (block.obj && val in block.obj.data) {
						this.html(block.obj.data[val].toString() || '');
					}

					if (editable) {
						$forms.prop_field(block.obj.data[val], {
							node: this
						});
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

				// Default href is just for show - will either be replaced or
				// overridden with a bound event.
				this.attr('href', '#' + val);

				var view_href = '';

				if (block.obj)
					view_href = '#' + botoweb.util.interpolate(botoweb.env.cfg.templates.model, block.model) + '?id=' + escape(block.obj.id);

				switch (val) {
					case 'update':
					case 'edit':
						if (data) {
							this.bind('click', function () {
								// TODO save editing info

								return false;
							});
						}
						else
							this.attr('href', view_href + '&action=edit');
						break;

					case 'clone':
						this.attr('href', view_href + '&action=clone');
						break;

					case 'create':
						if (block.model.name in botoweb.env.cfg.templates.editor)
							this.attr('href', '#' + botoweb.env.cfg.templates.editor[block.model.name] + '&action=create');
						else
							this.attr('href', '#' + botoweb.util.interpolate(botoweb.env.cfg.templates.model, block.model) + '&action=create');
						break;

					case 'delete':
						this.bind('click', function () {
							// TODO deletion interface
							//new botoweb.ui.widgets.DeleteObject();

							return false;
						});
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

								this.attr('href', href);
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

								this.attr('href', href);
							}

							// Otherwise, link to the botoweb page which will
							// display the content of the attribute
							else
								this.attr('href', botoweb.util.url_join(botoweb.env.cfg.base_url, block.model.href, block.obj.id, data));
						}
						break;

					default:
						this.attr('href', view_href);
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

			if (!block.model && !block.obj)
				return;

			$markup.find(block.node, 'relation', function(val, prop) {
				matches = true;

				this.removeAttr(prop);

				val = this.attr($markup.prop.attributes);

				var results = new botoweb.ui.widget.SearchResults(this, block.model);

				block.obj.follow(val, function (data, page, count) {
					results.update(data, page, count);
				});
			});

			return matches;
		},

		/**
		 * Parse date times.
		 */
		date_time: function (block) {
			var matches = false;

			$markup.find(block.node, 'date_time', function() {
				matches = true;

				new botoweb.ui.widget.DateTime(this);
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
				new botoweb.ui.widget.EditingTools(this, block.model, (this.attr($markup.prop.attributes) || ''));
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
})(jQuery);