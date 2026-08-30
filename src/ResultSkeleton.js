import './ResultSkeleton.css';

import React from 'react';

/** Placeholder shown while a word is being fetched. */
const ResultSkeleton = () => (
  <div className="word-display skeleton" aria-hidden="true">
    <div className="word-header">
      <div className="word-texts">
        <div className="skeleton-block skeleton-title"></div>
        <div className="skeleton-block skeleton-phonetic"></div>
      </div>
      <div className="skeleton-block skeleton-play"></div>
    </div>

    <div className="skeleton-block skeleton-heading"></div>
    <div className="skeleton-block skeleton-line"></div>
    <div className="skeleton-block skeleton-line short"></div>
    <div className="skeleton-block skeleton-line"></div>
  </div>
);

export default ResultSkeleton;
