/**
 * Provides an interface and support of special HTML markup for botoweb.
 *
 * @author Ian Paterson
 */

botoweb.ui = {
	widget: {},
	forms: {},
	nodes: {},

	/**
	 * Overlays the entire page with a very transparent block to prevent
	 * interaction.
	 */
	overlay: {
		node: null,
		show: function () {
			$('body').css('height', 'auto');
			botoweb.ui.overlay.node
			.css({
				width: $('body').width(),
				height: $('body').height(),
				zIndex: 9999,
				opacity: .35
			})
			.show();
		},
		hide: function () {
			botoweb.ui.overlay.node.hide();
		}
	},

	/**
	 * Shows a modal jQuery dialog which the user must close to continue.
	 */
	alert: function(msg, title, callback) {
		return $('<div/>')
			.attr('id', 'bw-alert')
			.html(msg)
			.dialog({
				modal: true,
				dialogClass: 'alert',
				width: 'auto',
				title: title || 'Alert',
				zIndex: 99999,
				buttons: {
					Ok: function() {
						$(this).dialog('close');
						$(this).remove();
						if (callback) callback();
					}
				}
			})
			.dialog('show')
	},

	/**
	 * Initializes the interface.
	 *
	 * NOTE: currently this is used for testing the local DB sync.
	 */
	init: function() {
		$('header nav li').addClass('ui-state-default ui-corner-top');
		$('header nav').show();

		botoweb.ui.nodes.search_results = $('<div class="search_results_container"><div class="search_results"></div></div>').appendTo($('body')).hide();
		$(botoweb.ui.page).bind('load.global', function () {
			botoweb.ui.overlay.hide();
		});

		$(botoweb.ui.page).bind('change.global', function (e, loc, new_page) {
			// Object deletion is normally handled by an event to avoid the
			// history entry. If that event is removed, we must handle the
			// deletion globally.
			if (loc.data && loc.data.action == 'delete') {
				var model = botoweb.env.models[loc.data.model];

				if (model)
					botoweb.ui.markup.delete_obj(model, loc.data.id, e);
				else
					history.back();

				// The page change is NOT authorized, we don't want this command
				// to update the UI in any way.
				return false;
			}

			$('#ui-timepicker-div, #ui-datepicker-div').hide();
			botoweb.ui.nodes.search_results.hide();

			// The page change is authorized
			return true;
		})

		botoweb.ui.overlay.node = $('<div/>').addClass('ui-widget-overlay')
			.appendTo(document.body)
			.hide();

		var loc = botoweb.ui.page.location;

		if (!loc.hash_href)
			document.location.href += '#' + botoweb.env.cfg.templates.home;

		botoweb.ui.page.init();
	},

	button: function (text, opt) {
		opt = opt || {};

		var $styles = botoweb.env.cfg.styles;

		var button = $('<button/>')
			.attr('type', opt.type || 'button')
			.addClass($styles.button + ' bw_button' + ((opt.mini) ? ' mini' : ''))
			.html(text);

		if (opt.icon) {
			button.prepend($('<span class="ui-icon ' + opt.icon + ((opt.no_text) ? ' no-text' : '') + '"/>'));
		}

		if (opt.corners) {
			button.removeClass('ui-corner-all');

			if (opt.corners[0])
				button.addClass('ui-corner-tl');
			if (opt.corners[1])
				button.addClass('ui-corner-tr');
			if (opt.corners[2])
				button.addClass('ui-corner-br');
			if (opt.corners[3])
				button.addClass('ui-corner-bl');
		}

		if (opt.href)
			button.click(function () { document.location = opt.href });

		if (opt.primary !== undefined) {
			if (opt.primary)
				button.addClass($styles.primary);
			else
				button.addClass($styles.secondary);
		}

		return button;
	},

	sortable: function (node) {
		return node.sortable({
			placeholder: 'ui-state-highlight ui-clearfix',
			forcePlaceholderSize: true,
			stop: function() {
				botoweb.ui.sort_icons(node);
			}
		}).disableSelection();
	},

	sort_icons: function(node) {
		if (node.find('li').length > 1) {
			node.find('li > span:first-child').attr('className', 'ui-icon ui-sorter ui-icon-arrowthick-2-n-s');
			node.find('li:first > span:first').attr('className', 'ui-icon ui-sorter ui-icon-arrowthick-1-s');
			node.find('li:last > span:first').attr('className', 'ui-icon ui-sorter ui-icon-arrowthick-1-n');
		}
		else {
			node.find('li > span:first').attr('className', 'ui-icon ui-sorter ui-icon-bullet');
		}
	}
};

$('.bw_button,.fg-button')
	.live('mouseover', function () {
		if (!$(this).is('.ui-state-disabled'))
			$(this).addClass(botoweb.env.cfg.styles.hover);
	})
	.live('mouseout', function () {
		$(this).removeClass(botoweb.env.cfg.styles.hover)
			.removeClass(botoweb.env.cfg.styles.active);
	})
	.live('mousedown', function () {
		$(this).addClass(botoweb.env.cfg.styles.active);
	})
	.live('mouseup', function () {
		$(this).removeClass(botoweb.env.cfg.styles.active);
	});