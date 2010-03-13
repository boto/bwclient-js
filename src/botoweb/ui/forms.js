/**
 * Provides support for numerous native and non-native form elements.
 *
 * @author Ian Paterson
 */

(function ($) {

var $util = botoweb.util;
var $ui = botoweb.ui;
var $forms = $ui.forms;

$forms.prop_field = function (prop, opt) {
	opt = opt || {};

	if (prop.is_type('text') || opt.input == 'textarea' || prop.meta.maxlength > 1024)
		return new $forms.Textarea(prop, opt);
	else if (prop.meta.choices)
		return new $forms.Dropdown(prop, opt);
	else if (prop.is_type('string') || opt.input == 'text')
		return new $forms.Text(prop, opt);
	else if (prop.is_type('dateTime') || opt.input == 'dateTime')
		return new $forms.DateTime(prop, opt);
	else if (prop.is_type('reference'))
		return new $forms.Picklist(prop, opt);
	else if (prop.is_type('boolean'))
		return new $forms.Bool(prop, opt);
	else if (prop.is_type('password') || opt.input == 'password')
		return new $forms.Password(prop, opt);
	else if (prop.is_type('blob') || opt.input == 'file')
		return new $forms.File(prop, opt);
	else if (prop.is_type('complexType'))
		return new $forms.Mapping(prop, opt);
	else
		return new $forms.Text(prop, opt);
};

/**
 * Base abstract class for all form field types.
 *
 * @constructor
 */
$forms.Field = function (prop, opt) {
	if (!prop)
		return;

	var self = this;

	this.prop = prop;
	this.node = $('<div class="prop_editor" />').hide();

	this.obj = prop.obj;
	this.model = prop.meta.model;
	this.opt = $.extend(true, {
		html: {
			tagName: 'input',
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

	if (this.opt.node) {
		this.node.insertAfter(this.opt.node);

		this.opt.node.dblclick(function () {
			self.edit(true);
		});
	}

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

		if (this.prop.is_type('list')) {
			var node = $('<li class="sortable_item clear"/>').append(field);

			this.node.find('ul').append(node);

			field.before($('<span class="ui-icon"/>'));
			$ui.sort_icons(this.node.find('ul'));
		}
		else {
			if (this.fields.length)
				this.fields[this.fields.length - 1].after(field);
			else
				this.node.append(field);

			field.before($('<br class="clear"/>'));
		}

		this.fields.push(field);
	};

	/**
	 * Switches the form to editing mode. When the mode is switched, we
	 * generate a fresh UI for editing the item. This facilitates canceling
	 * changes and incorporating any updates to the data since the editing
	 * fields were constructed.
	 */
	this.edit = function (atomic) {
		this.atomic = atomic;
		this.node.empty();

		if (this.prop.is_type('list'))
			this.node.append($ui.sortable($('<ul class="clear"/>')));

		var val = this.prop.val();

		if (val.length) {
			$.each(val, function () {
				self.add_field(this);
			});
		}
		else
			self.add_field();

		if (this.prop.is_type('list')) {
			this.node.prepend(
				$('<p/>').append(
					$ui.button('Add another value', '', true)
						.addClass('small')
						.click(function () {
							self.add_field();
							return false;
						})
				)
			);
		}

		if (this.atomic) {
			var $styles = botoweb.env.cfg.styles;

			this.node.append(
				$('<br class="clear"/>'),
				$('<p/>').append(
					$ui.button('Save', '', true)
						.addClass('small')
						.click(function () {
							// TODO save atomic update
							return false;
						}),
					$ui.button('Cancel', '', false)
						.addClass('small')
						.click(function () {
							self.cancel();
							return false;
						})
				)
			);
		}

		this.set_default();

		this.opt.node.hide();

		this.node.show();

		return this;
	};

	this.cancel = function () {
		this.fields = [];
		this.node.empty();
		this.node.hide();
		this.opt.node.show();
	}

	this.set_default = function () {
		$.each(this.fields, function () {
			if (!$(this).val())
				$(this).val(self.prop.meta.def);
		});
	}

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
		if (value)
			value = $util.html_unescape(value.val);
		else
			value = '';

		var field = $('<' + this.opt.html.tagName + '/>')
			.attr(this.opt.html.attr);

		// If the field supports choices this will add them
		this.reset_choices(field);

		field.val(value);

		return field;
	};

	if (this.obj) {
		$(this.obj).bind('edit', function () {
			self.edit();
		});
	}
};

$forms.Text = function () {
	$forms.Field.apply(this, arguments);

	this.opt.html.attr.type = 'text';
};

$forms.Textarea = function () {
	$forms.Field.apply(this, arguments);

	this.opt.html.tagName = 'textarea';
};

$forms.DateTime = function () {
	$forms.Field.apply(this, arguments);

	this.opt.html.attr.type = 'text';
};

$forms.Password = function () {
	$forms.Field.apply(this, arguments);

	this.opt.html.attr.type = 'password';
};

$forms.Dropdown = function () {
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

			field.append($('<option/>'));

			$.each(self.prop.meta.choices, function () {
				if (this.name || this.value)
					field.append($('<option/>').text(this.name || this.value).val(this.value));
			});
		}

		if (field)
			reset_choices.call(field);
		else
			$.each(this.fields, reset_choices);
	};
};

$forms.Bool = function () {
	$forms.Field.apply(this, arguments);

	this.build_field = function (value) {
		value = value.val;

		var field = $('<div><input type="radio" value="1"/> Yes &nbsp; <input type="radio" value="0"/> No</div>');



		field.append(
			$('<br class="clear"/>'),
			$ui.button('Clear')
				.addClass('small')
				.click(function () {
					field.find('input').attr('checked', false);
				})
		);

		// If the field supports choices this will add them
		this.reset_choices(field);

		field.find('input').attr({
			checked: false,
			// Random name just to make sure these function as radio buttons
			name: 'field_' + Math.round(Math.random() * 10000)
		});

		if (value !== null)
			field.find('input[value=' + value + ']').attr('checked', true);

		return field;
	};
};

$forms.File = function () {
	$forms.Field.apply(this, arguments);

	//this.build_field = function () {

	//};
};

$forms.Mapping = function () {
	$forms.Field.apply(this, arguments);

	//this.build_field = function () {

	//};
};

$forms.Picklist = function () {
	$forms.Field.apply(this, arguments);

	//this.build_field = function () {

	//};
};

})(jQuery);