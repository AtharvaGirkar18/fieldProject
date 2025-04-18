const getSubmitLec = (req, res, next) => {
  res.render("teacher/lecture", {
    currentPage: "lecture",
    locale: req.getLocale(),
  });
};

exports.getSubmitLec = getSubmitLec;
