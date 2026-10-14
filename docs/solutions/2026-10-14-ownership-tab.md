# Keep ownership lookups server-side and lazy

**Context:** ORA-121. The shareholders and corporate-group endpoints require the Orakel API key, and they only support
Norwegian org numbers.

**Rule used:** the Ownership tab calls the authenticated app logic function when opened. That function reads the
company record in the caller's access context, then requests the shareholder and group endpoints using the app's
server-side Orakel key. It does not add ownership to the main card request or persist it into Twenty.

The shareholders endpoint defaults to corporate holders only. Display entries from the latest available year, and
show empty states independently for shareholder data and group membership so a failure in one request does not hide
the other result.
