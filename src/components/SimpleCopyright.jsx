const SimpleCopyright = () => {
  const currentYear = new Date().getFullYear();
  
  return (
    <div className="bg-gray-900 text-white py-4">
      <div className="max-w-7xl mx-auto px-4 text-center">
        <p className="text-sm text-gray-400">
          © {currentYear} CrackersHyderabad | All Rights Reserved
        </p>
      </div>
    </div>
  );
};

export default SimpleCopyright;
