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
		'attribute':      'bwAttribute',
		'attributes':     'bwAttributes',
		'class_name':     'bwClass',
		'condition':      'bwCondition',
		'def':            'bwDefault',
		'editable':       'bwEditable',
		'existing_only':  'bwExistingOnly',
		'filter':         'bwFilter',
		'input_type':     'bwInputType',
		'link':           'bwLink',
		'model':          'bwModel',
		'template':       'bwTemplate',
		'trigger':        'bwTrigger',
		'widget':         'bwWidget'
	};

	/**
	 * Node selectors, used in $(sel)
	 */
	this.sel = {
		'attribute':      '*[bwAttribute]',
		'attribute_list': '*[bwWidget=attributeList]',
		'breadcrumbs':    '*[bwWidget=breadcrumbs]',
		'class_name':     '*[bwClass]',
		'condition':      '*[bwCondition]',
		'date_time':      '*[bwWidget=dateTime]',
		'editable':       '*[bwEditable]',
		'editing_tools':  '*[bwWidget=editingTools]',
		'existing_only':  '*[bwExistingOnly]',
		'header':         'header',
		'link':           'a[bwLink]',
		'model':          '*[bwModel]',
		'object':         'article, .bwObject',
		'relation':       '*[bwWidget=relation]',
		'report':         '*[bwWidget=report]',
		'search':         '*[bwWidget=search]',
		'search_results': '*[bwWidget=searchResults]',
		'section':        'section',
		'template':       '*[bwTemplate]',
		'trigger':        '*[bwTrigger]',
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
		this.sel.search_results,
		this.sel.relation,

		// Only properties which refer to a different object may be nested, the
		// parser must provide the names of any such properties.
		this.sel.attribute.replace(']', '={{ name }}]')
	];

	/**
	 * Formats a raw template according to formatting functions specified by the
	 * markup.page_store env configuration. Requires callback function in the
	 * event that templates included in the page must be loaded asynchronously.
	 *
	 * @param {String} html The page HTML.
	 * @param {Function} fnc The function to call when processing is complete.
	 */
	this.page_store = function (html, fnc) {
		var node = html;

		// Wrap HTML into a jQuery parent container to allow traversing. If it
		// is not a string, this is a recursive page_store call.
		if (typeof node == 'string')
			node = $('<div/>').append(html);

		var tmpl = node.find(this.sel.template + ':first');

		if (tmpl.length) {
			// Use botoweb.ui.page.load which will cache the template in
			// localStorage for future requests.
			botoweb.ui.page.load(tmpl.attr(this.prop.template), function (html) {
				tmpl.replace(html);
				fnc(node);
			});

			// Do not allow the callback to fire yet, we're not done.
			return;
		}

		// Run single-pass custom markup functions once all templates are loaded
		else if (botoweb.env.cfg.markup.page_store) {
			$.each(botoweb.env.cfg.markup.page_store, function (node) {
				this(node);
			});
		}

		// When everything is done, return the HTML to the callback
		fnc(node.html());
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

		// Create a new block and wait for any synchronous parsing to finish.
		var block = new botoweb.ui.markup.Block(node);

		fnc(block.node);
	};

	/**
	 * @param {jQuery} node The parent node.
	 * @param {String} sel The internal name of the botoweb markup selector.
	 * @param {Function} fcn Called once per matched node, value of the property
	 * corresponding to the selector is passed as the argument. Called in
	 * context of jQuery enhanced matched node.
	 */
	this.find = function (node, sel, fnc) {
		var prop = this.prop[sel];

		node.find(this.sel[sel]).each(function () {
			var val = '';
			var node = $(this);

			if (prop)
				val = node.attr(prop);

			fnc.call(node, [val, prop]);
		});
	};

	/**
	 * Temporarily replaces all nestable child nodes with empty divs.
	 */
	this.remove_nested = function (block) {
		block.nested = [];

		$.each(nesting, function () {
			function remove_nesting(sel) {
				block.node.find(sel).each(function() {
					// Temporarily replace the nestable block.nodes empty divs
					var tmp = $('<div/>');
					block.nested.push([tmp, $(this).replaceWith(tmp)]);
				});
			}

			var sel = botoweb.util.interpolate(this);

			// Selector can interpolate data... in this case it wants the meta
			// data of properties which refer to different objects.
			if (sel != this) {
				sel = this;
				$.each(block.model.props, function () {
					// Interpolation allows the selector to use any of the
					// property's metadata items to find specific DOM matches
					remove_nesting(botoweb.util.interpolate(sel, this.meta));
				});
			}
			else
				remove_nesting(sel);
		});
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
}();