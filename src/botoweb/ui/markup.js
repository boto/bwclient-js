/**
 * A library of generic reusable functions for parsing botoweb HTML markup.
 *
 * @author Ian Paterson
 */

botoweb.ui.markup = new function () {
	/**
	 * Property accessors, used in $(node).attr(prop)
	 */
	this.prop = {
		'action':         'bwAction',
		'attribute':      'bwAttribute',
		'_attribute':      '_bwAttribute',
		'attributes':     'bwAttributes',
		'class_name':     'bwClass',
		'condition':      'bwCondition',
		'context':        'bwContext',
		'date_format':    'bwDateFormat',
		'def':            'bwDefault',
		'editable':       'bwEditable',
		'existing_only':  'bwExistingOnly',
		'filter':         'bwFilter',
		'format':         'bwFormat',
		'formula':        'bwFormula',
		'input_type':     'bwInputType',
		'link':           'bwLink',
		'limit':          'bwLimit',
		'model':          'bwModel',
		'pre_condition':  'bwPreCondition',
		'searchable':     'bwSearchable',
		'template':       'bwTemplate',
		'trigger':        'bwTrigger',
		'use_context':    'bwUseContext',
		'widget':         'bwWidget'
	};

	/**
	 * Node selectors, used in $(sel)
	 */
	this.sel = {
		'action':         'form[bwAction]',
		'attribute':      '*[bwAttribute]',
		'_attribute':     '*[_bwAttribute]',
		'attribute_list': '*[bwWidget=attributeList]',
		'auth':           '.auth',
		'breadcrumbs':    '*[bwWidget=breadcrumbs]',
		'class_name':     '*[bwClass]',
		'condition':      '*[bwCondition]',
		'date_time':      '*[bwWidget=dateTime]',
		'editable':       '*[bwEditable]',
		'editing_tools':  '*[bwWidget=editingTools]',
		'edit_template':  '.bwEditTemplate',
		'existing_only':  '*[bwExistingOnly]',
		'header':         'header,div.header',
		'ignore':         '*[bwWidget=ignore]',
		'link':           'a[bwLink],button[bwLink]',
		'model':          '*[bwModel]',
		'object':         'article, .bwObject',
		'pre_condition':  '*[bwPreCondition]',
		'relation':       '*[bwWidget=relations]',
		'searchable':     '*[bwSearchable]',
		'search':         '*[bwWidget=search]',
		'search_results': '*[bwWidget=searchResults]',
		'section':        'section,div.section',
		'template':       '*[bwTemplate]',
		'trigger':        '*[bwTrigger]',
		'use_context':    '*[bwUseContext]',
		'view_template':  '.bwViewTemplate',
		'widget':         '*[bwWidget]'
	};

	/**
	 * All selectors which hold content pertaining to a different object, such
	 * as formatting markup for an attributeList, will be temporarily removed
	 * from the node while processing. This saves a lot of complexity in markup
	 * processing routines and reduces uncertainty due to processing order.
	 *
	 * @private
	 */
	var nesting = [
		this.sel.ignore,
		this.sel.search_results,
		this.sel.relation,
		this.sel.action

		// Only properties which refer to a different object may be nested, the
		// parser must provide the names of any such properties.
		//this.sel.attribute.replace(']', '={{ name }}]')
	];

	/**
	 * Stores the final selector generated for a particular model so that it
	 * need not be generated every time it is needed. It contains all of the
	 * static nesting selectors plus any selectors generated dynamically based
	 * on the model properties.
	 */
	var model_nesting = {};

	/**
	 * Formats a raw template according to formatting functions specified by the
	 * markup.page_store env configuration. Requires callback function in the
	 * event that templates included in the page must be loaded asynchronously.
	 *
	 * @param {String} html The page HTML.
	 * @param {Function} fnc The function to call when processing is complete.
	 */
	this.page_store = function (html, fnc, scripts) {
		var self = this;
		var node = html;

		// Special handling is required to remove scripts, otherwise they will
		// be executed...
		scripts = scripts || [];

		function remove_scripts(html) {
			return html.replace(/<script[^>]*>([\s\S]*?)<\/script>/g, function (m, js) {
				scripts.push(js);
				return '';
			});
		}

		// Wrap HTML into a jQuery parent container to allow traversing. If it
		// is not a string, this is a recursive page_store call.
		if (typeof node == 'string') {
			html = remove_scripts(html);

			node = $('<div/>').html(html);
		}

		var tmpl = node.find(this.sel.template + ':first');

		if (tmpl.length) {
			// Use botoweb.ui.page.load which will cache the template in
			// localStorage for future requests.
			botoweb.ui.page.load(tmpl.attr(this.prop.template), function (html) {
				var data = tmpl.attr(self.prop.def);

				if (data) {
					try {
						eval('data = ' + data);

						html = botoweb.util.interpolate(html, data);
					} catch (e) {}
				}

				html = remove_scripts(html);

				tmpl.replaceWith(html);
				self.page_store(node, fnc, scripts);
			});

			// Do not allow the callback to fire yet, we're not done.
			return;
		}

		// Run single-pass custom markup functions once all templates are loaded
		else if (botoweb.env.cfg.markup.page_store) {
			$.each(botoweb.env.cfg.markup.page_store, function () {
				this(node);
			});
		}

		html = node.html();

		// Join all scripts into one
		if (scripts.length)
			html += '\n<script type="text/javascript">\n' + scripts.join(';\n') + '\n</script>\n';

		// When everything is done, return the HTML to the callback
		fnc(html);
	};

	/**
	 * Formats markup for dynamic content and begins whatever processes are
	 * required to load the full page.
	 *
	 * @param {String} html The page HTML.
	 * @param {Function} fnc The function to call when processing is complete.
	 */
	this.page_show = function (html, fnc) {
		var node = $(html);

		$.each(botoweb.env.cfg.markup.page_show, function () {
			this(node);
		});

		// Create a new block and wait for any synchronous parsing to finish.
		var block = new botoweb.ui.markup.Block(node, $.extend(true, {
			root: true
		}, botoweb.ui.page.location.data));

		$(block).bind('init', function () {
			fnc(this.node);
		});

		block.parse();
	};

	/**
	 * @param {jQuery} node The parent node.
	 * @param {String} sel The internal name of the botoweb markup selector.
	 * @param {Function} fcn Called once per matched node, value of the property
	 * corresponding to the selector is passed as the argument. Called in
	 * context of jQuery enhanced matched node.
	 */
	this.find = function (node, sel, fnc, opt) {
		if (!opt) opt = {};
		var prop = this.prop[sel];

		node.find(this.sel[sel] + (opt.suffix || '')).each(function () {
			var val = '';
			var node = $(this);

			if (prop)
				val = node.attr(prop);

			fnc.call(node, val, prop);
		});
	};

	/**
	 * Temporarily replaces all nestable child nodes with empty divs.
	 */
	this.remove_nested = function (block) {
		var matches = false;
		block.nested = [];
		block.ignored = [];

		var sel = block.nested_sel;

		if (!sel && block.model)
			sel = model_nesting[block.model.name];

		if (!sel) {
			sel = [];

			$.each(nesting, function () {
				// Selector can interpolate data... in this case it wants the meta
				// data of properties which refer to different objects.
				if (this.indexOf('{{') >= 0) {
					if (!block.model)
						return;

					var s = this;

					$.each(block.model.ref_props, function () {
						// Interpolation allows the selector to use any of
						// the property's metadata items to find specific
						// DOM matches
						sel.push(botoweb.util.interpolate(s, this.meta));
					});
				}
				else {
					sel.push('' + this);
				}
			});

			if (block.model)
				model_nesting[block.model.name] = sel;
		}

		block.nested_sel = [];

		// It is faster to do each query separately than to join them into 1
		$.each(sel, function (i, s) {
			var sel_matches = false;

			block.node.find(s).each(function() {
				sel_matches = matches = true;

				// Temporarily replace the nestable block.nodes empty divs
				var tmp = $('<div/>');


				if (s == botoweb.ui.markup.sel.ignore)
					block.ignored.push([tmp, $(this).replaceWith(tmp)]);
				else
					block.nested.push([tmp, $(this).replaceWith(tmp)]);
			});

			if (sel_matches)
				block.nested_sel.push(s);
		});

		return matches;
	};

	/**
	 * Add nested structures back to the node so that they can be parsed.
	 */
	this.restore_nested = function (block) {
		$.each(block.nested, function () {
			$(this[0]).replaceWith(this[1]);
		});
		block.nested = [];
	};

	/**
	 * Add ignored structures back to the node after all parsing is complete.
	 */
	this.restore_ignored = function (block) {
		$.each(block.ignored, function () {
			$(this[0]).replaceWith(this[1]);
		});
		block.ignored = [];
	};

	/**
	 * Shows a confirmation and deletes an object.
	 */
	this.delete_obj = function (model, obj_id, e) {
		model.get(obj_id, function (obj) {
			var dialog = $('<div/>')
				.html(
					'Are you sure you want to delete the following ' + model.name + '?'
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

							obj.del(function (success) {
								botoweb.ui.overlay.hide();

								dialog.dialog('close')

								if (success) {
									// Get this object out of the history and go to a safe page
									botoweb.ui.page.backout({ id: obj.id });

									if (botoweb.ldb)
										setTimeout(botoweb.ldb.sync.update, 1000);
								}
							});
							return false;
						},
						'Cancel': function() {
							$(this).dialog('close');

							// Was triggered by a URL instead of an event
							if (!e && botoweb.ui.page.location.data.action == 'delete') {
								history.back();
							}
						}
					}
				});

			dialog.parent('.ui-dialog').find('button:last').addClass('ui-priority-secondary');
		});

		if (e)
			e.preventDefault();
		return false;
	}

	/**
	 * Sets the HTML of a node, accounting for various transformations which
	 * may be applied to that HTML.
	 */
	this.set_html = function (node, html, opt) {
		opt = $.extend({prefix: '', suffix: ''}, opt);
		var format = node.attr(this.prop.format);

		if (format && html) {
			var parts = format.split(' ');
			for (var i = 0; i < parts.length; i++) {
				if (parts[i])
					html = botoweb.util.format(parts[i], html, { node: node, commas: true });
			}
		}

		node.html(opt.prefix + html + opt.suffix);
	}
}();
