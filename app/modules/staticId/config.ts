
export default {
	options: {
		// 'logging': (d) => {log(d)},
		'dialect': 'sqlite',
		'storage': `${process.env.DATA_DIR || 'data'}/static-id.sqlite`
	}
}