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
		'model':          'bwModel',
		'link':           'bwLink',
		'attribute':      'bwAttribute',
		'attributes':     'bwAttributes',
		'condition':      'bwCondition',
		'trigger':        'bwTrigger',
		'template':       'bwTemplate',
		'editable':       'bwEditable',
		'class_name':     'bwClass',
		'filter':         'bwFilter',
		'existing_only':  'bwExistingOnly',
		'def':            'bwDefault',
		'widget':         'bwWidget',
		'input_type':     'bwInputType'
	};

	/**
	 * Node selectors, used in $(sel)
	 */
	this.sel = {
		'section':        'section',
		'object':         'article, .bwObject',
		'header':         'header',
		'widget':         '*[bwWidget]',
		'relations':      '*[bwWidget=relations]',
		'report':         '*[bwWidget=report]',
		'search':         '*[bwWidget=search]',
		'search_results': '*[bwWidget=searchResults]',
		'breadcrumbs':    '*[bwWidget=breadcrumbs]',
		'attribute_list': '*[bwWidget=attributeList]',
		'editing_tools':  '*[bwWidget=editingTools]',
		'date_time':      '*[bwWidget=dateTime]',
		'model':          '*[bwModel]',
		'condition':      '*[bwCondition]',
		'trigger':        '*[bwTrigger]',
		'editable':       '*[bwEditable]',
		'attribute':      '*[bwAttribute]',
		'template':       '*[bwTemplate]',
		'class_name':     '*[bwClass]',
		'existing_only':  '*[bwExistingOnly]',
		'link':           'a[bwLink]'
	};

	/**
	 * All selectors which hold content pertaining to a different object, such
	* as formatting markup for an attributeList, will be temporarily removed
	* from the node while processing. This saves a lot of complexity in markup
	* processing routines and reduces uncertainty due to processing order.
	*
	* @private
	*/
	var sel_nesting = [
		this.sel.search_results,
		this.sel.relations,
		this.sel.attribute_list,

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
		else if (botoweb.env.markup.page_store) {
			$.each(botoweb.env.markup.page_store, function (node) {
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

		var obj = {};

		var nested = [];

		$.each(sel_nesting, function () {
			var sel = botoweb.util.interpolate(this);

			// Selector can interpolate data... in this case it wants the meta
			// data of properties which refer to different objects.
			if (sel != this) {
				sel = this;
				$.each(obj.model.props, function () {
					// Interpolation allows the selector to use any of the
					// property's metadata items to find specific DOM matches
					node.find(botoweb.util.interpolate(sel, this.meta)).each(function() {
						// Temporarily replace the nestable nodes empty divs
						var tmp = $('<div/>');
						nested.push([tmp, $(this).replaceWith(tmp)]);
					});
				});
			}
		});


		this.parse.condition(node, obj);
		this.parse.trigger(node, obj);

		// Add nested structures back to the node so that they can be parsed.
		$.each(nested, function () {
			$(this[0]).replaceWith(this[1]);
		});



		fnc(node);
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
}();