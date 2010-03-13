/**
 * Provides support for numerous native and non-native form elements.
 *
 * @author Ian Paterson
 */

(function ($) {

botoweb.ui.forms = {
	/**
	 * Base abstract class for all form field types.
	 *
	 * @constructor
	 */
	Field: function (prop, opt) {
		if (!prop)
			return;

		this.node = $('<div class="prop_editor" />').hide();
		this.prop = prop;
		this.obj = prop.obj;
		this.model = prop.meta.model;
		this.opt = $.extend(true, {
			html: {
				tagName: 'text',
				attr: {}
			},
			choices: []
		}, opt);
		this.template = opt.template;
		this.fields = [];
		this.editing = false;

		/**
		 * If the field is included in a larger editing operation it is not
		 * atomic. Otherwise, committing an update to the field will update just
		 * that property of the object.
		 */
		this.atomic = false

		if (opt.node)
			this.node.after(opt.node);

		/**
		 * For fields such as dropdowns which have multiple choices, this method
		 * adds those choices. If the field is in editing mode, it also updates
		 * the UI with the new choices.
		 *
		 * @param {[Object]} choices An array of objects with the keys text and
		 * value.
		 * @param {Boolean} replace If true, existing choices will be removed.
		 */
		this.add_choices = function (choices, replace) {
			if (replace)
				this.opt.choices = choices;
			else
				$.merge(this.opt.choices, choices);

			if (editing) {
				// Must be defined in subclass
				this.reset_choices();
			}
		};

		/**
		 * Expands the form by adding another field or templated editor to allow
		 * input of multiple values. Generally this is only used on properties
		 * of type list, but since it can also be used to select multiple values
		 * for filtering a single-value property, this method is agnostic of the
		 * property type.
		 */
		this.add_field = function (value) {
			var field = this.build_field(value);

			this.fields.push(field);

			// If the field supports choices this will add them
			this.reset_choices(field);

			this.node.append(field);
		};

		/**
		 * Switches the form to editing mode. When the mode is switched, we
		 * generate a fresh UI for editing the item. This facilitates canceling
		 * changes and incorporating any updates to the data since the editing
		 * fields were constructed.
		 */
		this.edit = function () {
			$.each(this.prop.val(), function () {
				this.add_field(this);
			});

			this.opt.node.hide();

			this.node.show();
		};

		/**
		 * Switches the form to editing mode. When the mode is switched, we
		 * generate a fresh UI for editing the item. This facilitates canceling
		 * changes and incorporating any updates to the data since the editing
		 * fields were constructed.
		 */
		this.commit = function () {
			if (this.atomic) {
				var data = {};
				data[this.prop.name] = this.val();
				this.obj.update(data);
			}

			// Reset the property to view mode
			this.cancel();
		};

		/**
		 * Switches the form to editing mode. When the mode is switched, we
		 * generate a fresh UI for editing the item. This facilitates canceling
		 * changes and incorporating any updates to the data since the editing
		 * fields were constructed.
		 */
		this.cancel = function () {
			this.node.hide();
			this.opt.node.show();

			this.node.empty();
			this.fields = [];
		};

		/**
		 * Updates the choices in the UI to the current value of
		 * this.opt.choices.
		 *
		 * Implementation will vary based on the UI component, must be
		 * overridden.
		 */
		this.reset_choices = function () { };

		/**
		 * Generates the initial state of the editing field.
		 *
		 * Implementation may vary based on the UI component, this will handle
		 * basic form fields but should be overridden for more complex
		 * interfaces.
		 */
		this.build_field = function (value) {
			value = $util.html_unescape(value.val);

			return $('<' + this.opts.html.tagName + '/>')
				.attr(this.opts.html.attr)
				.val(value);
		};
	},

	Text: function () {
		$forms.Field.apply(this, arguments);

		this.opt.html.tagName = 'text';
	},

	Dropdown: function () {
		$forms.Field.apply(this, arguments);

		this.opt.html.tagName = 'select';

		/**
		 * Updates the choices in the UI to the current value of
		 * this.opt.choices.
		 */
		this.reset_choices = function (field) {
			var self = this;

			function reset_choices () {
				var field = $(this);
				field.empty();
				$.each(self.opt.choices, function () {
					field.append($('<option/>').attr(this));
				});
			}

			if (field)
				reset_choices.call(field);
			else
				$.each(this.fields, reset_choices);
		};
	},
};

var $forms = botoweb.ui.forms;
var $util = botoweb.ui.util;
})(jQuery);