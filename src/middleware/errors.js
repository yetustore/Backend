export const notFound = (_req, res) => {
  res.status(404).json({ error: 'Not found' });
};

export const errorHandler = (err, _req, res, _next) => {
  if (err?.name === 'ZodError') {
    return res.status(400).json({ error: 'Dados invalidos' });
  }
  if (err?.name === 'CastError') {
    return res.status(400).json({ error: 'Id invalido' });
  }
  const status = err.status || 500;
  const message = err.message || 'Server error';
  res.status(status).json({ error: message });
};
