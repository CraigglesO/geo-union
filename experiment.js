const fs = require('fs')
const { dissolvePolygons } = require('./lib')

// const multiPolygon = [
//   [
//     [
//       [
//         -70.13671875,
//         -7.536764322084078
//       ],
//       [
//         -19.86328125,
//         -7.536764322084078
//       ],
//       [
//         -19.86328125,
//         34.161818161230386
//       ],
//       [
//         -70.13671875,
//         34.161818161230386
//       ],
//       [
//         -70.13671875,
//         -7.536764322084078
//       ]
//     ]
//   ],
//   [
//     [
//       [
//         -19.86328125,
//         -7.536764322084078
//       ],
//       [
//         0,
//         -7.536764322084078
//       ],
//       [
//         0,
//         34.161818161230386
//       ],
//       [
//         -19.86328125,
//         -7.536764322084078
//       ]
//     ]
//   ]
// ]
const multiPolygon = [
  
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
