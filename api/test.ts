export default function handler(req: any, res: any) {
  res.json({ ok: true, method: req.method, url: req.url });
}
