const wdk = require('wikidata-sdk')
const got = require('got')

const cacheMap = new Map()

async function getSimplifiedQueryResults(query) {
	const url = wdk.sparqlQuery(query)
	const {body} = await got(url, {cache: cacheMap})
	const simplified = wdk.simplify.sparqlResults(body)
	return simplified
}

async function getTopCategories(topCategoryKind) {
	const query = `SELECT ?topclass
	WHERE {
		SELECT ?topclass ?middleclass WHERE {
			?topclass wdt:P279* wd:${topCategoryKind}.
			?middleclass wdt:P279 ?topclass.
			?item wdt:P31 ?middleclass.
			FILTER EXISTS {?item wdt:P18 ?image}.
		}
		GROUP BY ?topclass ?middleclass
		HAVING(COUNT(?item) >= 3)
	}
	GROUP BY ?topclass
	HAVING(COUNT(?middleclass) >= 2)`

	return getSimplifiedQueryResults(query)
}

async function getSubCategories(topCategory, minItems) {
	const query = `SELECT ?middleclass
WHERE {
  ?middleclass wdt:P279 wd:${topCategory}.
  ?item wdt:P31 ?middleclass.
  FILTER EXISTS {?item wdt:P18 ?image}.
}
GROUP BY ?middleclass
HAVING(COUNT(?item) >= ${minItems})`

	const results = await getSimplifiedQueryResults(query)
	return results
}

async function getItems(parentItem) {
	const query = `SELECT ?item
WHERE {
	?item wdt:P31 wd:${parentItem}.
	FILTER EXISTS {?item wdt:P18 ?image}.
}`

	const results = await getSimplifiedQueryResults(query)
	return results
}

async function getLabel(item, language) {
	const query = `SELECT ?itemLabel
WHERE {
  BIND (wd:${item} as ?item)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${language},en". }
}`
	const result = await getSimplifiedQueryResults(query)
	return result[0]
}

async function getImages(item) {
	const query = `SELECT ?image
WHERE {
  BIND (wd:${item} as ?item)
  ?item wdt:P18 ?image.
}`
	const result = await getSimplifiedQueryResults(query)
	return result
}

module.exports = {
	getTopCategories,
	getSubCategories,
	getItems,
	getLabel,
	getImages
}
