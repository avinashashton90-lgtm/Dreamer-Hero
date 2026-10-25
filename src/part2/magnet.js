// The ride's pickup assist (CONFIG.part2.ride.rideMagnet*): a pickup lying within `rideMagnetRadius` of the rider's lane — the line along
// the way he is heading — and not further than `rideMagnetAhead` ahead (or `rideMagnetBehind` back) drifts sideways toward that lane, so
// he never has to turn round for it. Only on the ride (the horse mounted); everywhere else pickups stay where they are.

/**
 * Move `pos` (a Vector3, x/z) toward the lane through `rider` (a Vector3) heading `heading`, by at most `M.rideMagnetPull * dt`.
 * Returns true if it was in the pull zone.
 */
export function lanePull(pos, rider, heading, M, dt) {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const dx = pos.x - rider.x;
  const dz = pos.z - rider.z;
  const along = dx * fx + dz * fz;
  const lat = dx * fz - dz * fx; // + = to the rider's right... the sign only matters for moving back toward the lane
  if (along > M.rideMagnetAhead || along < -M.rideMagnetBehind || Math.abs(lat) > M.rideMagnetRadius) return false;
  const move = Math.sign(lat) * Math.min(Math.abs(lat), M.rideMagnetPull * dt);
  pos.x -= move * fz;
  pos.z += move * fx;
  return true;
}
