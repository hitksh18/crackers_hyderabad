const SimpleCopyright = () => {
  const currentYear = new Date().getFullYear();

  return (
    <div
      className="relative overflow-hidden"
      style={{ background: 'linear-gradient(178deg, var(--maroon-900) 0%, #1A1714 100%)' }}
    >
      {/* Gold hairline rule — the same seam the full footer uses. */}
      <div
        aria-hidden="true"
        className="h-px w-full"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(210, 166, 79, 0.18) 14%, var(--gold-400) 50%, rgba(210, 166, 79, 0.18) 86%, transparent 100%)'
        }}
      />

      <div className="shell py-4 text-center">
        <p className="text-xs" style={{ fontFamily: 'var(--font-body)', color: '#9C9488' }}>
          © <span className="tabular">{currentYear}</span> Crackers Hyderabad | All Rights Reserved
        </p>
      </div>
    </div>
  );
};

export default SimpleCopyright;
