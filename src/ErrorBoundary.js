import React from 'react';

/**
 * Keeps an unexpected API payload from blanking the whole page: React unmounts
 * the entire tree when a render throws and nothing catches it.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <p className="placeholder-text">
          This entry could not be displayed. Try another word.
        </p>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
