const Telegraf = require('telegraf')

const entities = require('./entities')
const {
	getTopCategories,
	getSubCategories,
	getItems
} = require('./queries')

const {Extra, Markup} = Telegraf

function labeledItem(item, lang) {
	const label = entities.label(item, lang)
	const description = entities.description(item, lang)
	const url = `https://www.wikidata.org/wiki/${item}`

	let text = `*${label}* [${item}](${url})`

	if (description) {
		text += `\n  ${description}`
	}

	return text
}

function getRandomEntries(arr, amount = 1) {
	if (amount > arr.length) {
		throw new Error(`amount (${amount}) < arr.length (${arr.length})`)
	}

	const randomIds = []
	while (randomIds.length < amount) {
		const rand = Math.floor(Math.random() * arr.length)
		if (!randomIds.includes(rand)) {
			randomIds.push(rand)
		}
	}

	const entries = randomIds
		.map(i => arr[i])

	return entries
}

function getLang(ctx) {
	const lang = ctx.from.language_code
	return lang.split('-')[0]
}

async function pickItems(correctQNumber, differentQNumber) {
	const [allCorrect, allDifferent] = await Promise.all([
		getItems(correctQNumber),
		getItems(differentQNumber)
	])

	const correctItems = getRandomEntries(allCorrect, 3)
	const differentItem = getRandomEntries(allDifferent)[0]

	const items = [
		...correctItems
	]
	items.splice(Math.floor(Math.random() * (items.length + 1)), 0, differentItem)

	return {
		differentItem,
		items
	}
}

async function create(topCategoryKind, lang) {
	const topCategory = getRandomEntries(await getTopCategories(topCategoryKind))[0]
	const subCategories = getRandomEntries(await getSubCategories(topCategory), 2)
	const {items, differentItem} = await pickItems(...subCategories)

	await entities.load(topCategory, ...subCategories, ...items, differentItem)

	const mediaArr = items.map(o => buildEntry(o, lang))

	let text = ''
	text += labeledItem(topCategory, lang)

	text += '\n\n'
	text += mediaArr
		.map(o => o.caption)
		.join('\n')

	const keyboard = Markup.inlineKeyboard(
		items.map((o, i) => {
			const text = `🚫 ${i + 1}`
			if (o === differentItem) {
				return Markup.callbackButton(text, `a:${subCategories[0]}:${subCategories[1]}:${differentItem}`)
			}

			return Markup.callbackButton(text, 'a-no')
		})
	)

	return {
		keyboard,
		mediaArr,
		text
	}
}

async function send(ctx, topCategoryKind) {
	const lang = getLang(ctx)

	ctx.replyWithChatAction('upload_photo').catch(() => {})
	const {mediaArr, text, keyboard} = await create(topCategoryKind, lang)
	ctx.replyWithChatAction('upload_photo').catch(() => {})

	const msg = await ctx.replyWithMediaGroup(mediaArr)
	await ctx.reply(text, Extra.markdown().markup(keyboard).webPreview(false).inReplyTo(msg.slice(-1)[0].message_id))
}

function buildEntry(item, lang) {
	const images = entities.images(item, 800)
	const caption = labeledItem(item, lang)

	const imageUrl = getRandomEntries(images)[0]

	return {
		type: 'photo',
		media: imageUrl,
		caption,
		parse_mode: 'Markdown'
	}
}

const bot = new Telegraf.Composer()

bot.action('a-no', ctx => ctx.answerCbQuery('👎'))

bot.action(/a:(Q\d+):(Q\d+):(Q\d+)/, async (ctx, next) => {
	const correctCategory = ctx.match[1]
	const differentCategory = ctx.match[2]
	const differentItem = ctx.match[3]
	const lang = getLang(ctx)

	const originalItems = ctx.callbackQuery.message.entities
		.filter(o => o.url)
		.map(o => o.url.split('/').slice(-1)[0])

	await entities.load(correctCategory, differentCategory, ...originalItems)

	const mainCategoryLabel = labeledItem(originalItems[0], lang)
	const correctCategoryLabel = labeledItem(correctCategory, lang)
	const differentCategoryLabel = labeledItem(differentCategory, lang)

	let text = ''
	text += mainCategoryLabel

	text += '\n\n'
	const oldLines = await Promise.all(
		originalItems
			.slice(1)
			.map(async o => {
				const emoji = o === differentItem ? '🚫' : '✅'
				return `${emoji} ${labeledItem(o, lang)}`
			})
	)
	text += oldLines
		.join('\n')

	text += '\n\n'
	text += `✅3x ${correctCategoryLabel}`
	text += '\n'
	text += `🚫1x ${differentCategoryLabel}`

	await Promise.all([
		ctx.editMessageText(text, Extra.markdown().webPreview(false)),
		ctx.answerCbQuery('👍')
	])
	return next()
})

module.exports = {
	bot,
	send
}
