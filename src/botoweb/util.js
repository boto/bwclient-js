/**
 * Library of helper functions.
 *
 * @author Ian Paterson
 */
botoweb.util = {
	/**
	 * Returns a properly formatted ISO 8601 timestamp string.
	 *
	 * @param {Date} d A JavaScript Date, defaults to current date.
	 */
	timestamp: function (d) {
		if (!d)
			d = new Date();

		// Prepend 0s to ensure correct 2-digit dates and times
		var timestamp = [d.getUTCFullYear(),'0' + (d.getUTCMonth()+1),'0' + d.getUTCDate()].join('-') +
			'T' + ['0' + d.getUTCHours(),'0' + d.getUTCMinutes(),'0' + d.getUTCSeconds()].join(':');

		// Remove unnecessary leading 0s
		return timestamp.replace(/([:T-])0(\d\d)/g, '$1$2');
	},

	/**
	 * Joins any number of URL parts into a single URL. Preserves leading and
	 * trailing slashes on the first and last items, respectively.
	 */
	url_join: function () {
		return $.map(arguments, function (part, i) {
			if (!part)
				return;

			if (i > 0)
				part = part.replace(/^\/+/, '');

			if (i < arguments.length - 1)
				part = part.replace(/\/+$/, '');

			return part
		}).join('/');
	},

	/**
	 * Interpolates variables offset in strings by {{ var_name }} notation.
	 *
	 * @param {String} str The string containing interpolation markup.
	 * @param {Object} data The data available for interpolation.
	 * @return The interpolated string.
	 */
	interpolate: function (str, data) {
		if (!str) return str;
		if (!data) data = {};

		return str.replace(/\{\{\s*(\w+)\s*\}\}/g, function (m, key) {
			return data[key] || '';
		});
	},

	log: function (msg, err_type) {
		if (!msg)
			return;

		// Support use in catching errors
		if (msg.message)
			msg = msg.message;

		err_type = err_type || 'm';

		switch (err_type.charAt(0)) {
			case 'e':
				msg = '[BW ERROR] ' + msg;
				break;
			case 'w':
				msg = '[BW  WARN] ' + msg;
				break;
			default:
				msg = '[BW  MESG] ' + msg;
		}

		if (console)
			console.log(msg);
		else
			alert(msg);
	},

	error: function (msg) {
		botoweb.util.log(msg, 'e');
	},

	warn: function (msg) {
		botoweb.util.log(msg, 'w');
	}
};