// @flow
export type BBOX = [number, number, number, number]
export type Point = [number, number]
export type LineString = Array<Point>
export type Polygon = Array<LineString>
export type MultiPolygon = Array<Polygon>

type State = 0 | 1 | 2 // 0 -> outside, 1 -> inside, 2 -> overlap

type Intersection = {
  [string | number]: []
}

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
        j-- // incase the current poly can combine with another
        break
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
  if (!lineString1.bbox) lineString1.bbox = getBbox(lineString1)
  if (!lineString2.bbox) lineString2.bbox = getBbox(lineString2)
  // first check if the bbox's overlap, if they do not return
  const overlap = bboxOverlap(lineString1.bbox, lineString2.bbox)
  if (!overlap) return
  // run through the edges, if intersection 1, just keep it with the first one, for the second, drop it.
  const [outside1, inside1, overlap1, intersections1] = linePolyInteractions(lineString1, lineString2)
  const [outside2, inside2, overlap2, intersections2] = linePolyInteractions(lineString2, lineString1)
  if (!inside1.length && !overlap1.length && !inside2.length && !overlap2.length) return
  // Refine the cases where intersections exist. If two of the same intersection are found, remove
  refineIntersections(outside1, inside1, lineString1, intersections2)
  refineIntersections(outside2, inside2, lineString2, intersections1)
  // Refine the cases of overlap1 & overlap2
  refineOverlaps(outside1, overlap1, overlap2)
  // TODO: of remaining overlap data that goes against the flow of the other lineString,
  // convert that portion to inner
  overlapToInside(outside1, inside1, overlap2)
  // overlapToInside(outside2, inside2, overlap1)
  console.log('outside1', outside1)
  console.log('inside1', inside1)
  console.log('overlap1', overlap1)
  console.log('intersections1', intersections1)
  console.log('outside2', outside2)
  console.log('inside2', inside2)
  console.log('overlap2', overlap2)
  console.log('intersections2', intersections2)
  // one has only overlap and/or inside
  if (outside1 && !outside2) return outside1
  if (outside2 && !outside1) return outside2
  // merge the lines
  const lines = [...outside1, ...outside2]
  // Merge lines with same edges
  mergeLines(lines)
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

function mergeLines (lines: Array<LineString>) {
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
}

function refineIntersections (outside: Array<LineString>, inside: Array<LineString>,
  poly: LineString, intersections: Intersection) {
  let inters: Array<Point>, lineString: LineString, start: Point, point: Point,
  newSection: LineString, curIntersection: Point, isOutside: boolean, found: boolean
  // if there are any double or more intersections of the same line, we segregate out the inner pieces from outside
  for (let index in intersections) {
    index = +index
    const inters = intersections[index]
    if (inters.length > 1) {
      found = false
      // first grab the points
      start = poly[index]
      // sort according to distance from start
      inters.sort((a, b) => {
        return Math.sqrt(Math.pow(start[0] - a[0], 2) + Math.pow(start[1] - a[1], 2)) - Math.sqrt(Math.pow(start[0] - b[0], 2) + Math.pow(start[1] - b[1], 2))
      })
      // find the point outside
      for (let j = 0, ol = outside.length; j < ol; j++) {
        lineString = outside[j]
        for (let i = 0, ll = lineString.length; i < ll; i++) {
          point = lineString[i]
          if (equal(start, point) && isPointOnLineSegment(...start, ...poly[index + 1], ...inters[0])) {
            isOutside = true
            // first store the initial section of the array
            newSection = lineString.slice(0, i + 1)
            // loop, adding the intersection
            do {
              // get current intersection
              curIntersection = inters.shift()
              // add current intersection
              newSection.push(curIntersection)
              // store to appropriate section
              if (isOutside) outside.push(newSection)
              else inside.push(newSection)
              // update isOutside and clean newSection
              isOutside = !isOutside
              newSection = [curIntersection]
            } while (inters.length)
            // now add what's left of the current outside lineString to the end of the newSection and store
            newSection.push(...lineString.slice(i + 1))
            outside.push(newSection)
            // lastly, remove the old outside and mark intersection set as solved
            outside.splice(j, 1)
            found = true
            break
          }
        }
        if (found) break
      }
    }
  }
}

function refineOverlaps (outside: Array<LineString>, overlap: Array<LineString>, overlap2: Array<LineString>) {
  // Refining has two possibilities:
  // 1) If two overlaps are equal eachother, drop the overlaps
  // and store the overlap as an "outside"
  // 2) If two overlaps are equal but opposite to eachother, drop
  let firstOverlap: Point, secondOverlap: Point
  let fol: number, sol: number
  for (let j = 0, ol1 = overlap; j < ol1; j++) {
    firstOverlap = overlap[j]
    fol = firstOverlap.length - 1
    for (let i = 0, ol2 = overlap2; i < ol2; i++) {
      secondOverlap = overlap2[i]
      sol = secondOverlap.length - 1
      if (
        firstOverlap[0][0] === secondOverlap[0][0] && firstOverlap[0][1] === secondOverlap[0][1] &&
        firstOverlap[fol][0] === secondOverlap[sol][1] && firstOverlap[fol][1] === secondOverlap[sol][0]
      ) {
        outside.push(firstOverlap)
        overlap.splice(j, 1)
        overlap2.splice(i, 1)
        j--
        break
      } else if (
        firstOverlap[0][0] === secondOverlap[sol][0] && firstOverlap[0][1] === secondOverlap[sol][1] &&
        firstOverlap[fol][0] === secondOverlap[0][1] && firstOverlap[fol][1] === secondOverlap[0][0]
      ) {
        overlap.splice(j, 1)
        overlap2.splice(i, 1)
        j--
        break
      }
    }
  }
}

function overlapToInside (outside: Array<LineString>, inside: Array<LineString>, overlap: Array<LineString>) {
  // for each overlap, swap all containing outside1 to inside1 assuming overlap goes the opposite direction
  let lineString: LineString, curPoint: Point, nextPoint: Point, found: boolean, segment: LineString
  for (const ovrlp of overlap) {
    found = false
    for (let i = 0, ol = outside.length; i < ol; i++) {
      const lineString = outside[i]
      for (let j = 0, ll = lineString.length - 1; j < ll; j++) {
        curPoint = lineString[j]
        nextPoint = lineString[j + 1]
        // this if statement checks that the overlap exists and than verifies that it goes against the flow
        if (
          isPointOnLineSegment(...curPoint, ...nextPoint, ...ovrlp[1], true) &&
          isPointOnLineSegment(...curPoint, ...nextPoint, ...ovrlp[0], true) &&
          distance(curPoint, ovrlp[1]) < distance(curPoint, ovrlp[0])
        ) {
          // create first segment
          segment = lineString.slice(0, j + 1)
          // case 1: if start is equal to end of overlap, our first segment is the whole line
          if (equal(curPoint, ovrlp[1]) && equal(nextPoint, ovrlp[0])) {
            if (segment.length > 1) outside.push(segment)
            segment = []
            inside.push([curPoint, nextPoint])
          } else if (equal(curPoint, ovrlp[1])) { // case 2: overlap starts at current point and lands somewhere on the line
            if (segment.length > 1) outside.push(segment)
            segment = []
            inside.push([curPoint, ovrlp[0]])
            segment.push(ovrlp[0])
          } else if (equal(nextPoint, ovrlp[0])) { // case 3: overlap starts somewhere inside line, than ends on nextPoint
            segment.push(ovrlp[1])
            outside.push(segment)
            segment = []
            inside.push([ovrlp[1], nextPoint])
          } else { // case 4: we have two points inside the line
            segment.push(ovrlp[1])
            outside.push(segment)
            inside.push([ovrlp[1], ovrlp[0]])
            segment = [ovrlp[0]]
          }
          segment.push(...lineString.slice(j + 1))
          if (segment.length > 1) outside.push(segment)
          // remove the old outside linestring
          outside.splice(i, 1)
          found = true
          break
        }
      }
      if (found) break
    }
  }
}

// Three distinct cases here:
// 1) The bbox's do not overlap at all
// 2) The bbox's overlap partially
// 3) The bbox's overlap entirely, as in one bbox resides insde another
function bboxOverlap (bbox1, bbox2): void | BBOX {
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

export function linePolyInteractions (lineString: LineString, poly: LineString): [Array<LineString>, Array<LineString>, Array<LineString>, Array<Intersection>] {
  const outside: Array<LineString> = []
  const inside: Array<LineString> = []
  const overlap: Array<LineString> = []
  const stateLines = { 0: outside, 1: inside, 2: overlap } // [State]: LineString
  const intersections: Intersection = {} // [index of poly]: Array<Point>
  let state: State, nextState: State
  let point: Point, nextPoint: Point
  let line: LineString = []

  point = lineString[0]
  state = pointInPolygon(point, poly)
  line.push(point)
  for (let i = 1, ll = lineString.length; i < ll; i++) {
    nextPoint = lineString[i]
    nextState = pointInPolygon(nextPoint, poly)
    if (nextState !== state) {
      // if we are leaving or going to an overlap, the previous line finishes at that same point
      if (state === 2 || nextState === 2) {
        if (nextState === 2) line.push(nextPoint)
        // if the lines length is too small, just drop it
        if (line.length > 1) stateLines[state].push(line)
        line = []
        if (state === 2) line.push(point)
        line.push(nextPoint)
      } else { // a point went from outside to inside or vice versa, we need to find the intersection
        const [index, intersect] = getIntersection(point, nextPoint, poly)
        if (!intersections[index]) intersections[index] = [intersect]
        else intersections[index].push(intersect)
        line.push(intersect)
        stateLines[state].push(line)
        line = [intersect, nextPoint]
      }
    } else {
      line.push(nextPoint)
      if (state === 2 && nextState === 2) {
        stateLines[state].push(line)
        line = [nextPoint]
      }
    }
    // move forward without running PIP twice
    point = nextPoint
    state = nextState
  }
  if (line.length > 1) stateLines[state].push(line)
  return [outside, inside, overlap, intersections]
}

export function pointInPolygon (point: Point, poly: LineString): State {
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
    ) { return 2 }

    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside
    else if (isPointOnLineSegment(xi, yi, xj, yj, x, y)) return 2
  }

  if (inside) return 1
  else return 0
}

function isPointOnLineSegment (x1: number, y1: number, x2: number, y2: number, x: number, y: number, includePoints?: boolean = false): boolean {
  if (includePoints && ((x1 === x && y1 === y) || (x2 === x && y2 === y))) return true
  const dxc = x - x1
  const dyc = y - y1
  const dxl = x2 - x1
  const dyl = y2 - y1
  const cross = dxc * dyl - dyc * dxl
  if (cross !== 0) return false
  if (Math.abs(dxl) >= Math.abs(dyl)) return dxl > 0 ? x1 < x && x < x2 : x2 < x && x < x1
  return dyl > 0 ? y1 < y && y < y2 : y2 < y && y < y1
}

function getIntersection (p1: Point, p2: Point, poly: LineString): void | [number, Point] {
  // run through the polygon, for each cross
  for (let i = 0, pl = poly.length - 1; i < pl; i++) {
    const pp1 = poly[i]
    const pp2 = poly[i + 1]
    const intersect = intersects(p1[0], p1[1], p2[0], p2[1], pp1[0], pp1[1], pp2[0], pp2[1])
    if (intersect) return [i, intersect]
  }
}

function intersects (x1: number, y1: number, x2: number, y2: number, x3: number,
  y3: number, x4: number, y4: number): void | Point {
  const det = (x2 - x1) * (y4 - y3) - (x4 - x3) * (y2 - y1)
  if (!det) return
  const lambda = ((y4 - y3) * (x4 - x1) + (x3 - x4) * (y4 - y1)) / det
  const gamma = ((y1 - y2) * (x4 - x1) + (x2 - x1) * (y4 - y1)) / det
  const lambdaRound = round(lambda)
  const gammaRound = round(gamma)
  if ((lambdaRound >= 0 && lambdaRound <= 1) && (gammaRound >= 0 && gammaRound <= 1)) {
    return [x1 + lambda * (x2 - x1), y1 + lambda * (y2 - y1)]
  }
}

function distance (p1: Point, p2: Point): number {
  const a = p2[0] - p1[0]
  const b = p2[1] - p1[1]

  return Math.sqrt(a * a + b * b)
}

function round (num: number, eps?: number = EPSILON): number {
  return Math.round(num * eps) / eps
}

function equal (p1: Point, p2: Point) {
  if (p1[0] === p2[0] && p1[1] === p2[1]) return true
  return false
}
