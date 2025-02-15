const getCoordinators = (req, res, next) => {
  const coordinators = [
    // fake teacher
    {
      id: 1,
      name: "Harish Lulla",
      image: "https://randomuser.me/api/portraits/men/1.jpg",
    },
  ];

  res.render("head/headHome", { coordinators, currentPage: "headHome" });
};

const getAddCoordinator = (req, res, next) => {
  res.render("head/addCoordinator", { currentPage: "addCoordinator" });
};

const postAddCoordinator = (req, res, next) => {
  res.redirect("/head/headHome");
};

const getCoordinatorReport = (req, res, next) => {
  const coordinatorId = req.params.id;
  const fakeCoordinator = {
    id: coordinatorId,
    name: "Harish Lulla",
  };
  // fake details
  const fakeLectures = [
    {
      id: 1,
      teacher: "Atharva Girkar",
      date: "2024-04-29",
      address: "Santoshi Mata Mandir Pada",
      studentsPresent: 16,
    },
    {
      id: 2,
      teacher: "Ved Sarode",
      date: "2024-04-22",
      address: "Rupa Devi Mandir Parisar",
      studentsPresent: 18,
    },
    {
      id: 3,
      teacher: "Taneesh Hinduja",
      date: "2024-04-17",
      address: "Manesh Shaka",
      studentsPresent: 20,
    },
    {
      id: 4,
      teacher: "Saransh Kesarkar",
      date: "2024-04-10",
      address: "RypaDevi Tekdi",
      studentsPresent: 17,
    },
    {
      id: 5,
      teacher: "Aayush Attarde",
      date: "2024-04-03",
      address: "New Jay Bhavani Nagar",
      studentsPresent: 20,
    },
    {
      id: 6,
      teacher: "Pankaj Gupta",
      date: "2024-03-25",
      address: "Old Shala Area",
      studentsPresent: 15,
    },
    {
      id: 7,
      teacher: "Yugchaya Dhote",
      date: "2024-03-18",
      address: "Another Area",
      studentsPresent: 22,
    },
  ];

  // Group by month and sort by latest date first
  const groupedLectures = fakeLectures.reduce((acc, lecture) => {
    const month = new Date(lecture.date).toLocaleString("default", {
      month: "long",
      year: "numeric",
    });

    if (!acc[month]) acc[month] = [];
    acc[month].push(lecture);
    return acc;
  }, {});
  // Sorting each month's lectures in descending order
  for (let month in groupedLectures) {
    groupedLectures[month].sort((a, b) => new Date(b.date) - new Date(a.date));
  }
  res.render("head/coordinatorReport", {
    coordinator: fakeCoordinator,
    groupedLectures,
    currentPage: "coordinatorReport",
  });
};

const getLectureDetails = (req, res, next) => {
  const { id } = req.params;
  console.log("Lecture ID received:", id);
  // Fake lecture details (Replace with database fetch)
  const lecture = {
    id,
    date: "2025-02-12",
    time: "10:00 AM",
    address: "Signal Shala, Pune",
    studentsPresent: Math.floor(Math.random() * 30) + 10, // Random student count
    activity: "Taught Mathematics and Science",
    entryImage: "/images/entryImg.png",
    exitImage: "/images/exitImg.png",
  };

  res.render("head/lectureDetails", {
    lecture,
    currentPage: "lectureDetails",
  });
};

exports.getCoordinators = getCoordinators;
exports.getAddCoordinator = getAddCoordinator;
exports.postAddCoordinator = postAddCoordinator;
exports.getCoordinatorReport = getCoordinatorReport;
exports.getLectureDetails = getLectureDetails;
