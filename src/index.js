// @flow
export type BBOX = [number, number, number, number]
export type Point = [number, number]
export type LineString = Array<Point>
export type Polygon = Array<LineString>
export type MultiPolygon = Array<Polygon>

const EPSILON = 10000000

export function dissolvePolygons (polygons: MultiPolygon) {
  for (let j = 0; j < polygons.length - 1; j++) {
    const polygon = polygons[j]
    // check outerRing's of current polygon and other polygons in the fray
    for (let i = j + 1; i < polygons.length; i++) {
      const polygon2 = polygons[i]
      const newPoly = dissolveLineStrings(polygon[0], polygon2[0])
      if (newPoly) {
        // assuming a new LineString was created, we need to push all of the second poly's
        // holes to the first polygon and remove the second poly from the polygons array.
        // set the current polygons outerRing to the newOuterRing and decrement 'i' once.
        polygon[0] = newPoly[0]
        polygon.push(...polygon2.slice(1))
        polygon.push(...newPoly.slice(1))
        polygons.splice(i, 1)
        i--
      }
    }
    // dissolve the polygon holes afterwards incase holes overlap
    // const newPolys = dissolveHoles(polygon)
    // if (newPolys.length) polygons.push(...newPolys)
  }
}

export function dissolveHoles (polygon: Polygon): MultiPolygon {
  const newPolys = []
  for (let y = 1; y < polygon.length - 1; y++) {
    const hole1 = polygon[y]
    for (let x = y + 1; x < polygon.length; x++) {
      const hole2 = polygon[x]
      const newHole = dissolveLineStrings(hole1, hole2)
      if (newHole) {
        // assuming a new LineString was created, delete the second holes, and replace
        // the first hole with our new one. This also means that 'x' should decrement once.
        polygon[y] = newHole[0]
        newPolys.push(...newHole.slice(1))
        polygon.splice(x, 1)
        x--
      }
    }
  }
  return newPolys
}

function dissolveLineStrings (lineString1: LineString, lineString2: LineString): void | LineString {
  console.log('___________________')
  if (!lineString1.bbox) lineString1.bbox = getBbox(lineString1)
  if (!lineString2.bbox) lineString2.bbox = getBbox(lineString2)
  // first check if the bbox's overlap, if they do not return
  const overlap = bboxOverlap(lineString1.bbox, lineString2.bbox)
  if (!overlap) return
  // change order to check smallest first
  if (lineString1.length > lineString2.length) {
    let temp = lineString1
    lineString1 = lineString2
    lineString2 = temp
  }
  // run through the edges, if intersection 1, just keep it with the first one, for the second, drop it.
  console.log('LINE 111111')
  const [lines1, overlap1] = getLinesOutsidePoly(lineString1, lineString2, true)
  // console.log('lines1', lines1)
  // return
  if (!overlap1) return
  console.log('*******')
  console.log('*******')
  console.log('*******')
  console.log('LINE 2222222')
  const [lines2] = getLinesOutsidePoly(lineString2, lineString1, false)
  // merge the lines
  const lines = [...lines1, ...lines2]
  console.log('lines1', lines1)
  console.log('lines2', lines2)
  // Merge lines with same edges
  if (lines.length > 1) {
    for (let j = 0; j < lines.length - 1; j++) {
      const line1 = lines[j]
      const l1l = line1.length - 1
      for (let i = j + 1; i < lines.length; i++) {
        const line2 = lines[i]
        const l2l = line2.length - 1
        if (line1[0][0] === line2[l2l][0] && line1[0][1] === line2[l2l][1]) {
          lines[j] = line2.concat(line1.slice(1))
          lines.splice(i, 1)
          j--
          break
        } else if (line1[l1l][0] === line2[0][0] && line1[l1l][1] === line2[0][1]) {
          lines[j] = line1.concat(line2.slice(1))
          lines.splice(i, 1)
          j--
          break
        }
      }
    }
  }
  // ensure lines close on themselves (the slightly offset ones during creation of intersections) and recreate bboxs
  for (const line of lines) {
    const ll = line.length - 1
    if (line[0][0] !== line[ll][0] || line[0][1] !== line[ll][1]) line.push([line[0][0], line[0][1]])
    line.bbox = getBbox(line)
  }
  // Now that we have merged lines, we sort according to which lineStrings have bigger bboxs
  // (outer ring will be the biggest and encompass the holes)
  lines.sort((a, b) => {
    const left = a.bbox[0] - b.bbox[0]
    if (left) return left
    const right = b.bbox[2] - a.bbox[2]
    if (right) return right
    const bottom = a.bbox[1] - b.bbox[1]
    if (bottom) return bottom
    return b.bbox[3] - a.bbox[3]
  })
  // return lines
  return lines
}

export function getLinesOutsidePoly (lineString: LineString, poly: LineString, keepOverlap: boolean): [boolean, Array<LineString>] {
  let overlap: boolean = false
  let intersectionFound: boolean
  let lines: Array<LineString> = []
  let line: LineString = []
  let p1: Point, p2: Point, p3: Point, p4: Point

  p1 = lineString[0]
  // First step: figure out if the first point is INSIDE or OUTSIDE the poly, this is our starting point
  let inside = pointInPolygon(p1, poly, true)
  if (inside) overlap = true
  else line.push(p1)
  // run through each lineString edge and compare with all poly edges. If intersection found, build lines accordingly
  for (let i = 0, ll = lineString.length - 1; i < ll; i++) {
    p1 = lineString[i]
    p2 = lineString[i + 1]
    if (p1[0] === p2[0] && p1[1] === p2[1]) continue
    console.log('p1', p1)
    console.log('p2', p2)
    intersectionFound = false
    for (let j = 0, pl = poly.length - 1; j < pl; j++) {
      p3 = poly[j]
      p4 = poly[j + 1]
      // check for intersection, otherwise
      const [type, intersection] = intersects(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1], p4[0], p4[1])
      if (type) {
        console.log('intersection', type, inside, intersection)
        if (type === 1) {
          // we hit a perfect overlap, its like an inside = true
          if (line.length > 1) lines.push(line)
          line = []
          // check that the next point is outside the
          // const nextInside = (lineString[i + 2]) ? pointInPolygon(lineString[i + 2], poly, true) : false
          // if (!nextInside) line.push(p2)
          inside = pointInPolygon(p2, poly, true)
          if (!inside) line.push(p2)
          if (keepOverlap) lines.push([p1, p2])
        } else if (type === 2) {
          inside = false
          if (line.length > 1) lines.push(line)
          line = [p2]
          // drop
        } else if (type === 3) {
          if (!inside) {
            if (keepOverlap) line.push(p2)
            else line.push(intersection)
            if (line.length > 1) lines.push(line)
            line = []
          } else {
            if (keepOverlap) line.push(p1, p2)
            else line.push(intersection, p2)
          }
          inside = pointInPolygon(p2, poly, true)
        } else if (type === 4) {
          if (keepOverlap) line.push(p1, p2)
          inside = pointInPolygon(p2, poly, true)
        } else if (type === 5) {
          // check if the end point is inside
          const nextInside = pointInPolygon(p2, poly, true)
          if (nextInside) overlap = true
          // console.log('inside', inside)
          // console.log('nextInside', nextInside)
          // we were inside, but now we are not
          if (inside && !nextInside) {
            line.push(intersection, p2)
          } else if (!inside && nextInside) { // we were outside they poly, but now we are not
            line.push(intersection)
            if (line.length > 1) lines.push(line)
            line = []
          } else if ((!inside && !nextInside) || (inside && nextInside)) { // we were outside, and now we still are
            // get and store all intersections
            let intersections = [intersection, ...getAllIntersections(p1, p2, poly, j + 1)]
            // sort according to distance from p1
            intersections = intersections.sort((a, b) => {
              return Math.sqrt(Math.pow(p1[0] - a[0], 2) + Math.pow(p1[1] - a[1], 2)) - Math.sqrt(Math.pow(p1[0] - b[0], 2) + Math.pow(p1[1] - b[1], 2))
            })
            // iterate off and on, so the first will be IN, than the next will be our OUT
            let edgePoint
            while (intersections.length) {
              edgePoint = intersections.shift()
              if (edgePoint) line.push(edgePoint)
              if (line.length > 1) lines.push(line)
              line = []
              edgePoint = intersections.shift()
              if (edgePoint) line.push(edgePoint)
            }
            line.push(p2)
          }

          // store our new state
          inside = nextInside
        }
        overlap = intersectionFound = true
        break
      }
    }
    if (!intersectionFound && !inside) line.push(p2)
    if (!intersectionFound && inside && line.length) {
      if (line.length > 1) lines.push(line)
      line = []
    }
  }
  if (line.length > 1) lines.push(line)

  return [lines, overlap]
}

function getAllIntersections (p1: number, p2: number, poly: LineString, j: number) {
  const intersections = []
  let p3: Point, p4: Point
  for (let pl = poly.length - 1; j < pl; j++) {
    p3 = poly[j]
    p4 = poly[j + 1]
    const [type, intersection] = intersects(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1], p4[0], p4[1])
    if (type === 5) intersections.push(intersection)
  }

  return intersections
}

function getBbox (lineString) {
  const bbox = [Infinity, Infinity, -Infinity, -Infinity]

  for (const point of lineString) {
    if (bbox[0] > point[0]) bbox[0] = point[0]
    if (bbox[2] < point[0]) bbox[2] = point[0]
    if (bbox[1] > point[1]) bbox[1] = point[1]
    if (bbox[3] < point[1]) bbox[3] = point[1]
  }

  return bbox
}

// TODO: Should not include corners, but should include boundary edges
export function pointInPolygon (point: Point, poly: LineString, boundary?: boolean = false) {
  const x = point[0]
  const y = point[1]

  let inside = false
  let xi, yi, xj, yj
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    xi = poly[i][0]
    yi = poly[i][1]
    xj = poly[j][0]
    yj = poly[j][1]

    // if on boundary, than definitely in poly
    if (
      (y * (xi - xj) + yi * (xj - x) + yj * (x - xi) === 0) &&
      ((xi - x) * (xj - x) <= 0) && ((yi - y) * (yj - y) <= 0)
    ) {
      if (boundary) return true
      else return false
    }

    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside
  }

  return inside
}

// Three distinct cases here:
// 1) The bbox's do not overlap at all
// 2) The bbox's overlap partially
// 3) The bbox's overlap entirely, as in one bbox resides insde another
function bboxOverlap (bbox1, bbox2) {
  let leftRight, bottomTop
  // leftRight
  if (bbox1[0] <= bbox2[0] && bbox1[2] >= bbox2[2]) { // case 3: 2 inside 1
    leftRight = [bbox2[0], bbox2[2]]
  } else if (bbox2[0] <= bbox1[0] && bbox2[2] >= bbox1[2]) { // case 3: 1 inside 2
    leftRight = [bbox1[0], bbox1[2]]
  } else if (bbox1[0] <= bbox2[0] && bbox1[2] >= bbox2[0]) { // case 2: 1 on the left, 2 overlabs on the right side
    leftRight = [bbox2[0], bbox1[2]]
  } else if (bbox2[0] <= bbox1[0] && bbox2[2] >= bbox1[0]) { // case 2: 2 on the left, 1 overlabs on the right side
    leftRight = [bbox1[0], bbox2[2]]
  }
  // bottomTop
  if (bbox1[1] <= bbox2[1] && bbox1[3] >= bbox2[3]) { // case 3: 2 inside 1
    bottomTop = [bbox2[1], bbox2[3]]
  } else if (bbox2[1] <= bbox1[1] && bbox2[3] >= bbox1[3]) { // case 3: 1 inside 2
    bottomTop = [bbox1[1], bbox1[3]]
  } else if (bbox1[1] <= bbox2[1] && bbox1[3] >= bbox2[1]) { // case 2: 1 on bottom, 2 overlabs on the top side
    bottomTop = [bbox2[1], bbox1[3]]
  } else if (bbox2[1] <= bbox1[1] && bbox2[3] >= bbox1[1]) { // case 2: 3 on bottom, 1 overlabs on the top side
    bottomTop = [bbox1[1], bbox2[3]]
  }
  // if leftRight & bottomTop return, otherwise case 1
  if (leftRight && bottomTop) return [leftRight[0], bottomTop[0], leftRight[1], bottomTop[1]]
}

export function intersects (x1: number, y1: number, x2: number, y2: number, x3: number,
  y3: number, x4: number, y4: number): [number, Point] {
  const det = (x2 - x1) * (y4 - y3) - (x4 - x3) * (y2 - y1)
  if (!det) {
    // first case is where the two poly lines are inside eachother
    if (x1 === x3 && y1 === y3 && x2 === x4 && y2 === y4) return [1, null]
    // second case is where the edges of the polys are meeting
    else if (x1 === x4 && y1 === y4 && x2 === x3 && y2 === y3) return [2, null]
    // third case is partial overlap of each edge ([[0, 0], [2, 2]] && [[1, 1], [3, 3]])
    // or one is inside the other flush with edge ([[0, 0], [2, 2]] && [[1, 1], [2, 2]])
    // or one is inside the other ([[0, 0], [2, 2]] && [[0.5, 0.5], [1.5, 1.5]])
    else if (isPointOnLineSegment(x1, y1, x2, y2, x3, y3)) return [3, [x3, y3]]
    else if (isPointOnLineSegment(x1, y1, x2, y2, x4, y4)) return [3, [x4, y4]]
    else if (isPointOnLineSegment(x3, y3, x4, y4, x1, y1)) return [4, [x1, y1]]
    else if (isPointOnLineSegment(x3, y3, x4, y4, x2, y2)) return [4, [x2, y2]]
    else return [0, null] // no intersection found
  }
  let lambda = ((y4 - y3) * (x4 - x1) + (x3 - x4) * (y4 - y1)) / det
  let gamma = ((y1 - y2) * (x4 - x1) + (x2 - x1) * (y4 - y1)) / det
  let lambdaEps = round(lambda)
  let gammaEps = round(gamma)
  // third case, we find that the two lines are truly intersecting eachother
  // this will NOT include two edges meeting eachother at their tips.
  if ((lambdaEps > 0 && lambdaEps < 1) && (gammaEps > 0 && gammaEps < 1)) {
    return [5, [round(x1 + lambda * (x2 - x1)), round(y1 + lambda * (y2 - y1))]]
  }
  return [0, null] // no intersection found
}

export function isPointOnLineSegment (x1: number, y1: number, x2: number, y2: number, x: number, y: number): boolean {
  const dxc = x - x1
  const dyc = y - y1
  const dxl = x2 - x1
  const dyl = y2 - y1
  const cross = dxc * dyl - dyc * dxl
  if (cross !== 0) return false
  if (Math.abs(dxl) >= Math.abs(dyl)) return dxl > 0 ? x1 < x && x < x2 : x2 < x && x < x1
  return dyl > 0 ? y1 < y && y < y2 : y2 < y && y < y1
}

function round (num: number, eps?: number = EPSILON) {
  return Math.round(num * eps) / eps
}
