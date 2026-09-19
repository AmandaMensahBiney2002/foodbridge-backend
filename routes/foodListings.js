
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function FoodListings() {
  const navigate = useNavigate();

  const user = JSON.parse(localStorage.getItem("user"));
  const token = localStorage.getItem("token");

  const isDonor = user?.account_type === "donor";

  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const fetchListings = async () => {
    try {
      const endpoint = isDonor
        ? `http://localhost:5000/api/food-listings/donor/${user.id}`
        : "http://localhost:5000/api/food-listings";

      const response = await fetch(endpoint, {
        headers: isDonor
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {},
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to fetch food listings"
        );
      }

      setListings(data);
    } catch (error) {
      console.error("Error fetching food listings:", error);
      setError("Unable to load food listings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchListings();
  }, [isDonor, token, user?.id]);

  const handleDelete = async (listingId) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this food listing?"
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(listingId);
      setError("");

      const response = await fetch(
        `http://localhost:5000/api/food-listings/${listingId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to delete food listing"
        );
      }

      await fetchListings();
    } catch (error) {
      console.error("Delete food listing error:", error);
      setError(error.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFDF5] px-6 py-12 text-[#3F352C] md:px-12">
      <div className="mx-auto max-w-6xl">

        <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-[#006B3F]">
          FoodBridge
        </p>

        <h1 className="text-3xl font-bold md:text-4xl">
          {isDonor ? "My Food Listings" : "Available Food"}
        </h1>

        <p className="mt-3 max-w-2xl text-[#3F352C]/70">
          {isDonor
            ? "Manage the surplus food you have shared with the FoodBridge community."
            : "Browse surplus food currently available for redistribution."}
        </p>

        {isDonor && (
          <button
            onClick={() => navigate("/food-listings/new")}
            className="mt-6 rounded-xl bg-[#006B3F] px-5 py-3 font-bold text-white transition hover:bg-[#005531]"
          >
            Create Food Listing
          </button>
        )}

        {loading && (
          <p className="mt-10 text-[#3F352C]/70">
            Loading food listings...
          </p>
        )}

        {error && (
          <p className="mt-10 rounded-xl bg-red-50 p-4 text-sm text-red-600">
            {error}
          </p>
        )}

        {!loading && !error && listings.length === 0 && (
          <p className="mt-10 text-[#3F352C]/70">
            {isDonor
              ? "You have not created any food listings yet."
              : "No food listings are currently available."}
          </p>
        )}

        {!loading && !error && listings.length > 0 && (
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <div
                key={listing.id}
                className="flex h-full flex-col rounded-2xl border border-[#3F352C]/10 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="text-xl font-bold leading-tight">
                      {listing.food_name}
                    </h2>

                    <span className="shrink-0 rounded-full bg-[#E8F3EC] px-3 py-1 text-xs font-semibold capitalize text-[#006B3F]">
                      {listing.status}
                    </span>
                  </div>

                  <p className="mt-4 min-h-[48px] text-sm leading-relaxed text-[#3F352C]/65">
                    {listing.description || "No description provided."}
                  </p>
                </div>

                <div className="mt-6 rounded-xl bg-[#FFFDF5] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#3F352C]/55">
                    Available
                  </p>

                  <p className="mt-1 text-2xl font-bold text-[#006B3F]">
                    {listing.available_quantity}{" "}
                    <span className="text-base font-semibold">
                      {listing.unit || "portions"}
                    </span>
                  </p>
                </div>

                <div className="mt-6 space-y-4 text-sm">

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#3F352C]/50">
                      Pickup Location
                    </p>

                    <p className="mt-1 leading-relaxed">
                      {listing.pickup_location}
                    </p>
                  </div>

                  {!isDonor && listing.donor_first_name && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#3F352C]/50">
                        Donor
                      </p>

                      <p className="mt-1">
                        {listing.donor_first_name}{" "}
                        {listing.donor_last_name}
                      </p>
                    </div>
                  )}

                  {listing.expiry_date && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#3F352C]/50">
                        Expiry Date
                      </p>

                      <p className="mt-1">
                        {listing.expiry_date}
                      </p>
                    </div>
                  )}
                </div>

                {/* Donor Actions */}
                {isDonor && (
                  <div className="mt-auto flex gap-3 pt-6">
                    <button
                      onClick={() =>
                        navigate(
                          `/food-listings/${listing.id}/edit`
                        )
                      }
                      className="flex-1 rounded-xl border-2 border-[#006B3F] px-4 py-3 font-bold text-[#006B3F] transition hover:bg-[#E8F3EC]"
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => handleDelete(listing.id)}
                      disabled={deletingId === listing.id}
                      className="flex-1 rounded-xl border-2 border-red-500 px-4 py-3 font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deletingId === listing.id
                        ? "Deleting..."
                        : "Delete"}
                    </button>
                  </div>
                )}

                {/* Recipient Action */}
                {!isDonor && (
                  <button
                    onClick={() =>
                      navigate(
                        `/food-listings/${listing.id}/request`
                      )
                    }
                    className="mt-auto pt-6"
                  >
                    <span className="block w-full rounded-xl bg-[#006B3F] px-5 py-3 text-center font-bold text-white transition hover:bg-[#005531]">
                      Request Food
                    </span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default FoodListings;

