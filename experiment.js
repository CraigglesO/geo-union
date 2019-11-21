const fs = require('fs')
const { dissolvePolygons } = require('./lib')

const multiPolygon = [
  [
    [
      [
        -1.16455078125,
        -1.5598658653430082
      ],
      [
        6.218261718749999,
        -1.5598658653430082
      ],
      [
        6.218261718749999,
        6.795535025719518
      ],
      [
        -1.16455078125,
        6.795535025719518
      ],
      [
        -1.16455078125,
        -1.5598658653430082
      ]
    ]
  ],
  [
    [
      [
        5,
        -1.5598658653430082
      ],
      [
        8,
        -1.5598658653430082
      ],
      [
        8,
        4
      ],
      [
        5,
        4
      ],
      [
        5,
        -1.5598658653430082
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
