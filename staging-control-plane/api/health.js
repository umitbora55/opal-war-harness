export default function handler(_req, res) {
  res.status(200).json({
    ok: true,
    synthetic: true,
    service: 'opal-war-staging-control-plane',
  });
}
