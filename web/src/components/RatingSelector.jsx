import React from 'react';

export default function RatingSelector({ onSelect }) {
  return (
    <div className="panel">
      <h3>Rating Selector</h3>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onSelect && onSelect(5)}>A (5)</button>
        <button onClick={() => onSelect && onSelect(3)}>B (3)</button>
        <button onClick={() => onSelect && onSelect(1)}>C (1)</button>
      </div>
    </div>
  );
}
