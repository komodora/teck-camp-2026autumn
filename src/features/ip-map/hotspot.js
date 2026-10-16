// 区間ごとの円から、地球儀を向ける地点を決める。
// 件数の加重平均だと、東京と米国西海岸に割れたとき太平洋の真ん中を向く。近くにまとまった塊を選ぶ。

const EARTH_RADIUS_KM = 6371;
// 400系の件数を主に見る画面なので、同じ件数なら400系の多い地点を向く。
const CLIENT_ERROR_WEIGHT = 3;
const CLUSTER_RADIUS_KM = 1500;
const CANDIDATE_LIMIT = 20;
// 今の地点の1.5倍を超える塊が別の場所に現れたときだけ乗り換える。
const SWITCH_RATIO = 1.5;
const MIN_SHIFT_DEGREES = 8;

const CLUSTER_RADIUS_DEGREES = (CLUSTER_RADIUS_KM / EARTH_RADIUS_KM) * (180 / Math.PI);

// 再生でもスクラブでも同じ時点なら同じ地点になるよう、先頭から順に決めた結果を時点ごとに返す。
// 円の無い時点は直前の地点を引き継ぐ。各時点は直近数分の合計なので、単発のアクセスはそれだけで薄まる。
export function trackHotspots(circlesByWindow) {
  const hotspots = [];
  let focus = null;
  for (const circles of circlesByWindow) {
    const points = circles.map(toPoint);
    if (points.length > 0) focus = nextFocus(focus, points);
    hotspots.push(focus);
  }
  return hotspots;
}

export function angularDistanceDegrees(left, right) {
  const leftVector = toVector(left);
  const rightVector = toVector(right);
  const dot = leftVector[0] * rightVector[0] + leftVector[1] * rightVector[1] + leftVector[2] * rightVector[2];
  return toDegrees(Math.acos(Math.max(-1, Math.min(1, dot))));
}

function nextFocus(focus, points) {
  const candidate = densestCluster(points);
  if (!focus) return candidate;
  if (angularDistanceDegrees(focus, candidate) <= MIN_SHIFT_DEGREES) return focus;
  const currentScore = scoreAround(points, focus);
  if (currentScore > 0 && candidate.score <= currentScore * SWITCH_RATIO) return focus;
  return candidate;
}

function toPoint(circle) {
  const statusWeight = circle.statusClass === "4xx" ? CLIENT_ERROR_WEIGHT : 1;
  return {
    lng: circle.longitude,
    lat: circle.latitude,
    weight: circle.count * statusWeight,
    countryCode: circle.countryCode,
  };
}

function densestCluster(points) {
  const candidates = points
    .slice()
    .sort((left, right) => right.weight - left.weight)
    .slice(0, CANDIDATE_LIMIT);

  let best = null;
  for (const candidate of candidates) {
    const members = points.filter((point) => angularDistanceDegrees(point, candidate) <= CLUSTER_RADIUS_DEGREES);
    const score = sumWeights(members);
    if (!best || score > best.score) best = { members, score };
  }

  const heaviest = best.members.reduce((left, right) => (right.weight > left.weight ? right : left));
  return { ...sphericalMean(best.members), score: best.score, countryCode: heaviest.countryCode };
}

function scoreAround(points, focus) {
  return sumWeights(points.filter((point) => angularDistanceDegrees(point, focus) <= CLUSTER_RADIUS_DEGREES));
}

function sumWeights(points) {
  return points.reduce((total, point) => total + point.weight, 0);
}

// 緯度経度を平均すると日付変更線をまたぐ塊が反対側へ飛ぶ。球面上のベクトルで平均する。
function sphericalMean(points) {
  const sum = [0, 0, 0];
  for (const point of points) {
    const vector = toVector(point);
    sum[0] += vector[0] * point.weight;
    sum[1] += vector[1] * point.weight;
    sum[2] += vector[2] * point.weight;
  }
  const length = Math.hypot(sum[0], sum[1], sum[2]);
  return {
    lng: toDegrees(Math.atan2(sum[1], sum[0])),
    lat: toDegrees(Math.asin(sum[2] / length)),
  };
}

function toVector({ lng, lat }) {
  const latitude = toRadians(lat);
  const longitude = toRadians(lng);
  return [Math.cos(latitude) * Math.cos(longitude), Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude)];
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}
