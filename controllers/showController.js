import axios from "axios";
import Movie from "../models/movie.js";
import Show from "../models/show.js";

export const getNowPlayingMovies = async (req, res) => {
  try {
    const { date } = await axios.get(
      "https://api.themoviedb.org/3/movie/now_playing",
      {
        headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
      },
    );
    const movies = date.results;
    res.json({ success: true, movies });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: error.message });
  }
};

export const addShow = async (req, res) => {
  try {
    const { movieId, showsInput, showPrice } = req.body;

    let movie = await Movie.findById(movieId);

    if (!movie) {
      const [movieDetailsResponse, movieCreditResponse] = await Promise.all([
        axios.get(`https://api.themoviedb.org/3/movie/${movieId}`, {
          headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
        }),

        axios.get(`https://api.themoviedb.org/3/movie/${movieId}/credits`, {
          headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
        }),
      ]);

      const movieApiData = movieDetailsResponse.data;
      const movieCreditsData = movieCreditResponse.data;

      const movieDetails = {
        _id: movieId,
        title: movieApiData.title,
        overview: movieApiData.overview,
        poster_path: movieApiData.poster_path,
        backdrop_path: movieApiData.backdrop_path,
        release_date: movieApiData.release_date,
        orginal_lenguage: movieApiData.orginal_lenguage,
        tagline: movieApiData.tagline || "",
        vote_avarafe: movieApiData.vote_avarafe,
        runtime: movieApiData.runtime,
        genres: movieApiData.genres,
        casts: movieCreditsData.cast,
      };

      movie = await Movie.create(movieDetails);
    }

    const showsToCreate = [];
    showsInput.forEach((show) => {
      const showData = show.date;
      show.time.forEach((time) => {
        const dateTimeString = `${showDate}T${time}`;
        showsToCreate.push({
          movie: movieId,
          showDataTime: new Date(dateTimeString),
          showPrice,
          occupiedSeats: {},
        });
      });
    });

    if (showsToCreate.length > 0) {
      await Show.insertMany(showsToCreate);
    }


    await inngest.send({
      name: "app/show-added",
      data: {movieTitle: movie.title},
    })

    res.json({ success: true, message: "Shows added successfully" });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: error.message });
  }
};

export const getShows = async (req, res) => {
  try {
    const shows = await Show.find({ showDataTime: { $gte: new Date() } })
      .populate("movie")
      .sort({ showDataTime: 1 });

    const uniqueShows = new Set(shows.map((show) => show.movie));
    res.json({ success: true, shows: Array.from(uniqueShows) });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: error.message });
  }
};

export const getShow = async (req, res) => {
  try {
    const { movieId } = req.params;
    const shows = await Show.find({
      movie: movieId,
      showDataTime: { $gte: new Date() },
    });
    const movie = await Movie.findById(movieId);
    const dataTime = {};

    shows.forEach((show) => {
      const date = show.showDataTime.toISOString().split("T")[0];
      if (!dataTime[date]) {
        dataTime[date] = [];
      }
      dataTime[date].push({ time: show.showDataTime, showId: show._id });
    });
    res.json({ success: true, movie, dataTime });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: error.message });
  }
};
