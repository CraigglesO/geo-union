const fs = require('fs')
const { dissolvePolygons } = require('./lib')

const multiPolygon = [
  [
          [
            [
              -0.11947631835937499,
              0.6674043402557894
            ],
            [
              0.08514404296875,
              0.6674043402557894
            ],
            [
              0.08514404296875,
              0.8623941932270534
            ],
            [
              -0.11947631835937499,
              0.8623941932270534
            ],
            [
              -0.11947631835937499,
              0.6674043402557894
            ]
          ]
        ],
        [
          [
            [
              0.0116729736328125,
              0.7786320384912766
            ],
            [
              0.1860809326171875,
              0.7786320384912766
            ],
            [
              0.1860809326171875,
              0.9166326492847015
            ],
            [
              0.0116729736328125,
              0.9166326492847015
            ],
            [
              0.0116729736328125,
              0.7786320384912766
            ]
          ]
        ]
]

dissolvePolygons(multiPolygon)

const featureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'MultiPolygon',
        coordinates: multiPolygon
      }
    }
  ]
}

fs.writeFileSync('./out.geojson', JSON.stringify(featureCollection, null, 2))
