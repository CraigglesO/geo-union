const fs = require('fs')
const { dissolvePolygons } = require('./lib')

// intersects(0, 0, 1, 1, 0.5, 0.5, 2, 2)

// console.log(pointInPolygon([0.5, 0], [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]))

const multiPolygon = [
  [
    [
      [
        0,
        0.01171875
      ],
      [
        0,
        0.0078125
      ],
      [
        0.00390625,
        0.0078125
      ],
      [
        0.00390625,
        0.01171875
      ],
      [
        0,
        0.01171875
      ]
    ]
  ],
  [
    [
      [
        0.000007941673824418574,
        0.0078125
      ],
      [
        0.00000794167382438712,
        0.01171875
      ],
      [
        0,
        0.01171875
      ],
      [
        0,
        0.0078125
      ],
      [
        0.000007941673824418574,
        0.0078125
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
