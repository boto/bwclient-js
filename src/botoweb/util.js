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
	}
};
