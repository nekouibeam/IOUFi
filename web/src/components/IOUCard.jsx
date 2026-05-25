import React from 'react';

export default function IOUCard({ title = 'IOU Item' }) {
  return (
    <div className="panel">
      <h3>{title}</h3>
      <p className="muted">Placeholder IOU card for marketplace listings.</p>
    </div>
  );
}
